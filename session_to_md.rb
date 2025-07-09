#!/usr/bin/env ruby

require 'json'
require 'pathname'
require 'io/console'
require 'time'

class SessionToMarkdown
  def initialize(input)
    @input = input
    @output = []
    @pending_tools = []
    @pending_tool_results = []
    @tool_call_map = {}  # Map tool_use_id to tool call info
    @current_cwd = nil
    @current_assistant_message = nil
    @current_tool_use_result = nil
  end

  def convert
    lines = @input.strip.split("\n")
    messages = []
    
    lines.each do |line|
      next if line.strip.empty?
      
      begin
        data = JSON.parse(line)
        messages << data
      rescue => e
        $stderr.puts "Error parsing JSON line: #{e.message}"
        $stderr.puts "Offending line: #{line}"
        raise e
      end
    end
    
    # Process messages with tool call coalescing
    messages.each_with_index do |message, index|
      begin
        process_message(message, messages, index)
      rescue => e
        $stderr.puts "Error processing message at index #{index}: #{e.message}"
        $stderr.puts "Message data: #{message.to_json}"
        $stderr.puts "Backtrace: #{e.backtrace.join("\n")}"
        raise e
      end
    end
    
    # Flush any remaining pending tool results
    flush_pending_tool_results
    
    @output.join("\n")
  end

  private

  def strip_line_numbers(content)
    # Remove line numbers in format "123→" from the beginning of each line
    content.split("\n").map do |line|
      line.sub(/^\s*\d+→/, '')
    end.join("\n")
  end

  def make_relative_path(path)
    return path unless @current_cwd && path
    
    begin
      pathname = Pathname.new(path)
      cwd_pathname = Pathname.new(@current_cwd)
      
      # Get the relative path from cwd to the target path
      relative_path = pathname.relative_path_from(cwd_pathname)
      relative_path.to_s
    rescue ArgumentError
      # If paths are on different drives or can't be made relative, return original
      path
    end
  rescue
    path  # Return original path if any error occurs
  end

  def process_message(data, messages, index)
    # Extract current working directory from the message
    @current_cwd = data['cwd'] if data['cwd']
    
    case data['type']
    when 'summary'
      process_summary(data)
    when 'user'
      process_user_message(data, messages, index)
    when 'assistant'
      process_assistant_message(data, messages, index)
    end
  end

  def process_summary(data)
    # Generate summary from first user input instead of using data['summary']
    summary = generate_summary_from_first_user_input
    @output << "# #{summary}"
    @output << ""
  end

  def process_user_message(data, messages, index)
    message = data['message']
    
    # Skip "Caveat" meta messages
    if data['isMeta'] && message['content'].is_a?(String) && message['content'].start_with?("Caveat:")
      return
    elsif data['isMeta'] && message['content'].is_a?(Array)
      # Check if any text content starts with "Caveat:"
      text_contents = message['content'].select { |item| item['type'] == 'text' }
      if text_contents.any? { |item| item['text']&.start_with?("Caveat:") }
        return
      end
    end
    
    # Handle isMeta messages by putting them in collapsible details
    if data['isMeta']
      content_text = extract_text_content(message['content'])
      unless content_text.empty?
        # Use first line or first 50 characters as summary
        summary_text = content_text.split("\n").first || content_text
        summary_text = summary_text[0..50] + "..." if summary_text.length > 50
        
        @output << "<details><summary>#{summary_text}</summary>"
        @output << ""
        content_text.split("\n").each do |line|
          @output << "> #{line}"
        end
        @output << ""
        @output << "</details>"
        @output << ""
      end
      return
    end
    
    # Capture toolUseResult data if present
    @current_tool_use_result = data['toolUseResult']
    
    if message['content'].is_a?(Array)
      # Check if this is a tool result response
      tool_results = message['content'].select { |item| item['type'] == 'tool_result' }
      regular_content = message['content'].select { |item| item['type'] != 'tool_result' }
      
      if tool_results.any?
        # Check if any tool result is an error (user cancellation)
        error_results = tool_results.select { |result| result['is_error'] }
        
        if error_results.any?
          # Show user cancellation prominently
          @output << "**❌ User cancelled tool execution**"
          @output << ""
        else
          # Add tool results to pending collection
          tool_results.each do |tool_result|
            @pending_tool_results << tool_result
          end
          
          # Check if the next message is also a user message with tool results
          next_message = messages[index + 1]
          is_continuing_results = next_message && 
                                 next_message['type'] == 'user' && 
                                 next_message['message']['content'].is_a?(Array) &&
                                 next_message['message']['content'].any? { |item| item['type'] == 'tool_result' }
          
          # If not continuing, flush the results
          unless is_continuing_results
            flush_pending_tool_results
          end
        end
      end
      
      if regular_content.any?
        # Check for special content types
        content_item = regular_content.first
        if content_item.is_a?(Hash) && content_item['type'] == 'text'
          content_text = content_item['text']
        else
          content_text = content_item['content'] || content_item.to_json
        end
        
        if content_text == "[Request interrupted by user for tool use]"
          # Skip this message since we already showed the cancellation above
          return
        end
        
        @output << "### User"
        @output << ""
        regular_content.each do |content_item|
          if content_item.is_a?(Hash) && content_item['type'] == 'text'
            content_text = content_item['text']
          else
            content_text = content_item['content'] || content_item.to_json
          end
          content_text.split("\n").each do |line|
            @output << "> #{line}"
          end
        end
        @output << ""
      end
    else
      # Regular user message
      content = message['content']
      
      # Handle command messages
      command_name_match = content.match(/<command-name>([^<]+)<\/command-name>/)
      command_args_match = content.match(/<command-args>([^<]*)<\/command-args>/)
      
      if command_name_match
        command_name = command_name_match[1]
        command_args = command_args_match ? command_args_match[1] : ""
        
        # Handle special command formats
        if command_name == "/clear"
          @output << "**🧹 User cleared the session**"
          @output << ""
          return
        end
        
        # Display command with args in quotes
        @output << "### User"
        @output << ""
        if command_args.empty?
          @output << "> #{command_name}"
        else
          @output << "> #{command_name} \"#{command_args}\""
        end
        @output << ""
        return
      elsif content.match(/<local-command-stdout><\/local-command-stdout>/)
        # Skip empty command output
        return
      end
      
      @output << "### User"
      @output << ""
      content.split("\n").each do |line|
        @output << "> #{line}"
      end
      @output << ""
    end
  end

  def process_assistant_message(data, messages, index)
    message = data['message']
    
    # Skip API error messages
    return if data['isApiErrorMessage']
    
    if message['content'].is_a?(Array)
      text_content = message['content'].select { |item| item['type'] == 'text' }
      tool_uses = message['content'].select { |item| item['type'] == 'tool_use' }
      
      # Check if this is part of a tool call sequence
      if tool_uses.any?
        # Check if the next message is also an assistant message with tool calls
        next_message = messages[index + 1]
        is_continuing_tools = next_message && 
                             next_message['type'] == 'assistant' && 
                             next_message['message']['content'].is_a?(Array) &&
                             next_message['message']['content'].any? { |item| item['type'] == 'tool_use' }
        
        # If we have text content, start a new assistant section
        if text_content.any?
          @output << "### Assistant"
          @output << ""
          text_content.each do |content_item|
            @output << content_item['text']
            @output << ""
          end
        end
        
        # Add tool uses to pending list and map them by ID (but don't display them yet)
        tool_uses.each do |tool_use|
          @pending_tools << tool_use
          @tool_call_map[tool_use['id']] = tool_use
        end
        
        # Don't flush pending tools here - they'll be shown with their results
      else
        # Regular assistant message with just text
        @output << "### Assistant"
        @output << ""
        text_content.each do |content_item|
          @output << content_item['text']
          @output << ""
        end
      end
    else
      # Simple text message
      @output << "### Assistant"
      @output << ""
      @output << message['content']
      @output << ""
    end
  end

  def flush_pending_tools
    # Clear pending tools without displaying them - they'll be shown with results
    @pending_tools.clear
  end

  def flush_pending_tool_results
    return if @pending_tool_results.empty?
    
    @pending_tool_results.each do |tool_result|
      content = tool_result['content']
      tool_use_id = tool_result['tool_use_id']
      
      # Check if this tool result has structured patch data
      structured_patch = @current_tool_use_result.is_a?(Hash) ? @current_tool_use_result['structuredPatch'] : nil
      file_path = @current_tool_use_result.is_a?(Hash) ? @current_tool_use_result['filePath'] : nil
      
      if structured_patch && file_path
        # Show file edit as a proper diff
        relative_path = make_relative_path(file_path)
        @output << "**Edit:** `#{relative_path}`"
        @output << ""
        @output << "```diff"
        
        structured_patch.each do |hunk|
          lines = hunk['lines']
          lines.each do |line|
            @output << line
          end
        end
        
        @output << "```"
        @output << ""
      else
        # Get the original tool call info if available
        tool_call = @tool_call_map[tool_use_id]
        
        # Special handling for TodoWrite - format as markdown todo list (not collapsed)
        if tool_call && tool_call['name'] == 'TodoWrite'
          @output << "**Updated task list**"
          @output << ""
          @output << format_todo_list(tool_call['input'])
          @output << ""
        else
          # Create a summary for the list item
          tool_summary = create_tool_result_list_summary(content, tool_use_id)
          
          @output << "<details><summary>#{tool_summary}</summary>"
          @output << ""
          
          # Format the content based on type
          if content.is_a?(Array)
            # Handle structured content (array of content items)
            content.each do |content_item|
              if content_item['type'] == 'text'
                @output << content_item['text']
                @output << ""
              end
            end
          elsif tool_call && ((tool_call['name'] == 'Bash' && tool_call['input']['command']&.match(/^(ls|LS)(\s|$)/)) || tool_call['name'] == 'LS')
            # Special handling for ls commands and LS tool - truncate if needed
            @output << "```"
            lines = content.split("\n")
            if lines.length > 50
              truncated_content = lines.first(50).join("\n")
              truncated_content += "\n... (#{lines.length - 50} more lines)"
              @output << truncated_content
            else
              @output << content
            end
            @output << "```"
          elsif content.match(/^\s*\d+→/)
            # File read result with line numbers
            # Try to get language from file path if available
            file_path = tool_call && tool_call['name'] == 'Read' ? tool_call['input']['file_path'] : nil
            language = file_path ? detect_language_from_path(file_path) : detect_language(content)
            stripped_content = strip_line_numbers(content)
            @output << "```#{language}"
            @output << stripped_content
            @output << "```"
          elsif content.match(/^(Found \d+ files|\/.*\..*$)/)
            # File search results
            @output << "```"
            @output << content
            @output << "```"
          elsif content.match(/^\s*(import|export|function|const|let|var|class|interface|type)/)
            # Code content
            @output << "```typescript"
            @output << content
            @output << "```"
          else
            # Plain text result
            @output << "```"
            @output << content
            @output << "```"
          end
          
          @output << "</details>"
          @output << ""
        end
      end
    end
    
    @pending_tool_results.clear
    # Also clear pending tools since they've been displayed with results
    @pending_tools.clear
    # Clear current tool use result
    @current_tool_use_result = nil
  end

  def create_combined_tool_results_summary(tool_results)
    count = tool_results.length
    
    if count == 1
      create_tool_result_summary(tool_results.first['content'], tool_results.first['tool_use_id'])
    else
      types = tool_results.map { |result| classify_tool_result(result['content']) }.uniq
      
      if types.length == 1
        case types.first
        when :file_read
          "📄 #{count} file reads"
        when :file_search
          "🔍 #{count} search results"
        when :command
          "▶️ #{count} commands executed"
        when :file_operation
          "✅ #{count} file operations"
        else
          "📝 #{count} tool results"
        end
      else
        "🔧 #{count} tool results"
      end
    end
  end

  def classify_tool_result(content)
    if content.match(/^\s*\d+→/)
      :file_read
    elsif content.match(/^(Found \d+ files|\/.*\..*$)/)
      :file_search
    elsif content.match(/^(Tool ran without output|Command completed)/)
      :command
    elsif content.match(/^(.*has been updated|.*created successfully|.*deleted successfully)/)
      :file_operation
    else
      :other
    end
  end

  def process_tool_use(tool_use)
    tool_name = tool_use['name']
    tool_input = tool_use['input']
    
    @output << "**#{tool_name}:** #{format_tool_input(tool_input)}"
    @output << ""
  end

  def format_tool_input(input)
    if input.is_a?(Hash)
      if input.size == 1
        key, value = input.first
        "`#{value}`"
      else
        formatted_pairs = input.map { |k, v| "#{k}: #{v}" }
        "`#{formatted_pairs.join(', ')}`"
      end
    else
      "`#{input}`"
    end
  end

  def format_tool_input_html(input)
    if input.is_a?(Hash)
      if input.size == 1
        key, value = input.first
        "<code>#{value}</code>"
      else
        formatted_pairs = input.map { |k, v| "#{k}: #{v}" }
        "<code>#{formatted_pairs.join(', ')}</code>"
      end
    else
      "<code>#{input}</code>"
    end
  end


  def create_tool_result_list_summary(content, tool_use_id)
    # Get the original tool call info if available
    tool_call = @tool_call_map[tool_use_id]
    
    if tool_call
      tool_name = tool_call['name']
      tool_input = tool_call['input']
      
      case tool_name
      when 'TodoWrite'
        "<b>TodoWrite:</b> Updated task list"
      when 'Read'
        file_path = make_relative_path(tool_input['file_path']) || 'unknown file'
        limit = tool_input['limit']
        if limit
          "<b>Read:</b> <code>#{file_path}, limit: #{limit}</code>"
        else
          "<b>Read:</b> <code>#{file_path}</code>"
        end
      when 'Grep'
        pattern = tool_input['pattern']
        path = tool_input['path'] ? make_relative_path(tool_input['path']) : 'current directory'
        include_filter = tool_input['include']
        if include_filter
          "<b>Grep:</b> pattern <code>#{pattern}</code> in <code>#{path}</code> (#{include_filter})"
        else
          "<b>Grep:</b> pattern <code>#{pattern}</code> in <code>#{path}</code>"
        end
      when 'Edit'
        file_path = make_relative_path(tool_input['file_path']) || 'unknown file'
        "<b>Edit:</b> <code>#{file_path}</code>"
      when 'Bash'
        command = tool_input['command']
        # Don't capitalize ls command
        display_command = command.start_with?('LS ') ? command.sub(/^LS /, 'ls ') : command
        display_command = display_command == 'LS' ? 'ls' : display_command
        "<b>Bash:</b> <code>#{display_command}</code>"
      when 'Write'
        file_path = make_relative_path(tool_input['file_path']) || 'unknown file'
        "<b>Write:</b> <code>#{file_path}</code>"
      when 'Fetch'
        url = tool_input['url']
        "<b>Fetch:</b> <code>#{url}</code>"
      when 'LS'
        path = tool_input['path'] ? make_relative_path(tool_input['path']) : 'current directory'
        "<b>ls:</b> <code>#{path}</code>"
      else
        "<b>#{tool_name}:</b> #{format_tool_input_html(tool_input)}"
      end
    else
      # Fallback to content-based inference
      if content.match(/^\s*\d+→/)
        lines = content.split("\n")
        "<b>Read:</b> file content (#{lines.length} lines)"
      elsif content.match(/^Found \d+ files/)
        match_info = content.split("\n").first
        "<b>Search:</b> #{match_info}"
      elsif content.match(/^\/.*\..*$/)
        file_count = content.split("\n").length
        "<b>Search:</b> found #{file_count} file(s)"
      elsif content.match(/^(.*has been updated|.*created successfully|.*deleted successfully)/)
        result_info = content.split("\n").first
        "<b>Edit:</b> #{result_info}"
      elsif content.match(/^(Tool ran without output|Command completed)/)
        "<b>Command:</b> executed successfully"
      elsif content.match(/^Received \d+/)
        "<b>Fetch:</b> #{content.split("\n").first}"
      else
        "<b>Tool result:</b> #{content.length} characters"
      end
    end
  end

  def create_tool_result_summary(content, tool_use_id)
    # Create a meaningful summary based on content type
    if content.match(/^\s*\d+→/)
      # File read result
      lines = content.split("\n")
      if lines.length > 3
        "📄 File content (#{lines.length} lines)"
      else
        "📄 File content"
      end
    elsif content.match(/^Found \d+ files/)
      "🔍 #{content.split("\n").first}"
    elsif content.match(/^\/.*\..*$/)
      file_count = content.split("\n").length
      "📁 #{file_count} file(s)"
    elsif content.match(/^(.*has been updated|.*created successfully|.*deleted successfully)/)
      "✅ #{content.split("\n").first}"
    elsif content.match(/^(Tool ran without output|Command completed)/)
      "▶️ Command executed"
    elsif content.length > 100
      "📝 Tool result (#{content.length} chars)"
    else
      "📝 Tool result"
    end
  end

  def format_tool_result(content_item)
    content = content_item['content']
    
    # Check if it's a file read result with line numbers
    if content.match(/^\s*\d+→/)
      @output << "**Tool Result:**"
      @output << ""
      # Detect language from context or use generic
      language = detect_language(content)
      stripped_content = strip_line_numbers(content)
      @output << "```#{language}"
      @output << stripped_content
      @output << "```"
      @output << ""
    elsif content.match(/^(Found \d+ files|\/.*\..*$)/)
      # File search results
      @output << "**Tool Result:**"
      @output << ""
      @output << "```"
      @output << content
      @output << "```"
      @output << ""
    elsif content.match(/^\s*(import|export|function|const|let|var|class|interface|type)/)
      # Code content
      @output << "**Tool Result:**"
      @output << ""
      @output << "```typescript"
      @output << content
      @output << "```"
      @output << ""
    else
      # Plain text result
      @output << "**Tool Result:**"
      @output << ""
      @output << "```"
      @output << content
      @output << "```"
      @output << ""
    end
  end

  def format_todo_list(input)
    return "" unless input && input['todos']
    
    output = []
    input['todos'].each do |todo|
      checkbox = case todo['status']
      when 'completed'
        '[x]'
      else # pending or in_progress
        '[ ]'
      end
      
      status_indicator = case todo['status']
      when 'in_progress'
        ' (in progress)'
      else
        ''
      end
      
      output << "- #{checkbox} #{todo['content']}#{status_indicator}"
    end
    
    output.join("\n")
  end

  def extract_text_content(content)
    if content.is_a?(Array)
      text_items = content.select { |item| item['type'] == 'text' }
      text_items.map { |item| item['text'] }.join("\n")
    else
      content.to_s
    end
  end

  def detect_language_from_path(path)
    case path
    when /\.(js|jsx)$/i
      "javascript"
    when /\.(ts|tsx)$/i
      "typescript"
    when /\.(rb|ruby)$/i
      "ruby"
    when /\.(py|python)$/i
      "python"
    when /\.(cpp|cc|cxx|c\+\+|hpp|h)$/i
      "cpp"
    when /\.c$/i
      "c"
    when /\.java$/i
      "java"
    when /\.go$/i
      "go"
    when /\.rs$/i
      "rust"
    when /\.php$/i
      "php"
    when /\.(sh|bash)$/i
      "bash"
    when /\.sql$/i
      "sql"
    when /\.json$/i
      "json"
    when /\.(yaml|yml)$/i
      "yaml"
    when /\.xml$/i
      "xml"
    when /\.html$/i
      "html"
    when /\.css$/i
      "css"
    when /CMakeLists\.txt$/i
      "cmake"
    when /Makefile$/i
      "makefile"
    when /\.md$/i
      "markdown"
    else
      ""
    end
  end

  def detect_language(content)
    case content
    when /\.(js|ts|jsx|tsx):/
      "typescript"
    when /\.(rb|ruby):/
      "ruby"
    when /\.(py|python):/
      "python"
    when /\.(cpp|cc|cxx|c):/
      "cpp"
    when /\.(java):/
      "java"
    when /\.(go):/
      "go"
    when /\.(rs):/
      "rust"
    when /\.(php):/
      "php"
    when /\.(sh|bash):/
      "bash"
    when /\.(sql):/
      "sql"
    when /\.(json):/
      "json"
    when /\.(yaml|yml):/
      "yaml"
    when /\.(xml):/
      "xml"
    when /\.(html):/
      "html"
    when /\.(css):/
      "css"
    when /CMakeLists\.txt/
      "cmake"
    else
      ""
    end
  end

  def generate_summary_from_first_user_input
    lines = @input.strip.split("\n")
    
    lines.each do |line|
      next if line.strip.empty?
      
      begin
        data = JSON.parse(line)
        
        # Skip non-user messages
        next unless data['type'] == 'user'
        
        # Skip meta messages
        next if data['isMeta']
        
        message = data['message']
        content = message['content']
        
        # Extract text content
        if content.is_a?(Array)
          # Skip tool result messages
          regular_content = content.select { |item| item['type'] != 'tool_result' }
          next if regular_content.empty?
          
          content_text = regular_content.first
          if content_text.is_a?(Hash) && content_text['type'] == 'text'
            content = content_text['text']
          else
            content = content_text['content'] || content_text.to_json
          end
        end
        
        # Skip command messages
        next if content.match(/<command-name>([^<]+)<\/command-name>/)
        
        # Skip special messages
        next if content == "[Request interrupted by user for tool use]"
        next if content.match(/<local-command-stdout><\/local-command-stdout>/)
        
        # Found the first actual user input
        # Store up to 200 characters, display first 50
        stored_content = content.length > 200 ? content[0...200] : content
        display_content = stored_content.length > 50 ? stored_content[0...50] : stored_content
        
        return display_content
      rescue => e
        # Skip lines that can't be parsed
        next
      end
    end
    
    # Fallback if no user input found
    "Untitled"
  end
end

class SessionBrowser
  def initialize
    @claude_projects_dir = File.expand_path("~/.claude/projects")
  end

  def run
    unless Dir.exist?(@claude_projects_dir)
      puts "Claude projects directory not found: #{@claude_projects_dir}"
      exit 1
    end

    loop do
      # Get list of projects
      projects = Dir.entries(@claude_projects_dir)
                    .reject { |d| d.start_with?('.') }
                    .select { |d| File.directory?(File.join(@claude_projects_dir, d)) }
                    .sort

      if projects.empty?
        puts "No projects found in #{@claude_projects_dir}"
        exit 1
      end

      # Create display names for projects (remove path prefixes and make readable)
      project_display_names = projects.map do |project|
        display_name = project.gsub('-Users-mnutt-p-', '')
                             .gsub('-', '/')
                             .gsub('_', ' ')
        display_name
      end

      # Let user select project
      selected_project_display = select_from_list(project_display_names, "Select a project:")
      return unless selected_project_display
      
      # Find the original project name
      project_index = project_display_names.index(selected_project_display)
      selected_project = projects[project_index]

      project_dir = File.join(@claude_projects_dir, selected_project)
      
      # Get list of JSONL files
      jsonl_files = Dir.glob(File.join(project_dir, "*.jsonl")).sort.reverse

      if jsonl_files.empty?
        puts "No session files found in #{project_dir}"
        next  # Go back to project selection
      end

      # Build session list with metadata
      sessions = build_session_list(jsonl_files)

      # Sort sessions by timestamp, descending (most recent first)
      sessions.sort! do |a, b|
        begin
          time_a = parse_timestamp_for_sorting(a[:timestamp])
          time_b = parse_timestamp_for_sorting(b[:timestamp])
          time_b <=> time_a  # Descending order
        rescue
          # If parsing fails, fall back to string comparison
          b[:timestamp] <=> a[:timestamp]
        end
      end

      # Let user select session
      selected_session = select_from_list(sessions, "Select a session:")
      
      # If user escaped from session selection, go back to project selection
      next unless selected_session

      session_file = selected_session[:file]

      # Process the selected file
      input = File.read(session_file)
      converter = SessionToMarkdown.new(input)
      output = converter.convert
      puts output
      
      # Copy to clipboard if pbcopy is available
      if system("which pbcopy > /dev/null 2>&1")
        IO.popen("pbcopy", "w") { |pipe| pipe.write(output) }
        puts "\n📋 Copied to clipboard"
      end
      
      return  # Exit after processing a session
    end
  end

  private

  def build_session_list(jsonl_files)
    jsonl_files.map do |file|
      begin
        # Read first few lines to find timestamp and summary
        timestamp = nil
        summary = 'Untitled'
        message_count = 0
        
        File.open(file) do |f|
          # Keep reading until we find a valid timestamp or reach end of file
          while !f.eof?
            line = f.readline
            entry = JSON.parse(line)
            
            # Count messages (user and assistant)
            if entry['type'] == 'user' || entry['type'] == 'assistant'
              message_count += 1
            end
            
            # Get timestamp from first entry that has a valid one
            if timestamp.nil? && entry['timestamp'] && is_valid_timestamp?(entry['timestamp'])
              timestamp = entry['timestamp']
            end
            
            # Generate summary from first user input instead of using summary entry
            if summary == 'Untitled' && entry['type'] == 'user' && !entry['isMeta']
              summary = extract_first_user_input_for_summary(entry)
            end
            
            # Break early if we have both
            break if timestamp && summary != 'Untitled'
          end
        end
        
        # Fallback to filename if no timestamp found
        timestamp ||= File.basename(file).sub('.jsonl', '')
        
        # Get file modification time
        mtime = File.mtime(file)
        
        {
          file: file,
          timestamp: timestamp,
          summary: summary,
          message_count: message_count,
          modified: mtime,
          created: mtime # Using mtime as created for now
        }
      rescue => e
        mtime = File.mtime(file) rescue Time.now
        {
          file: file,
          timestamp: File.basename(file).sub('.jsonl', ''),
          summary: 'Error reading file',
          message_count: 0,
          modified: mtime,
          created: mtime
        }
      end
    end
  end

  def is_valid_timestamp?(timestamp)
    return false if timestamp.nil? || timestamp.empty?
    
    # Reject UUIDs
    return false if timestamp.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
    
    # Accept ISO timestamps, Unix timestamps, or anything that looks like a date
    return true if timestamp.match(/^\d{4}-\d{2}-\d{2}/)  # Date format
    return true if timestamp.match(/^\d{10,13}$/)         # Unix timestamp
    return true if timestamp.match(/T\d{2}:\d{2}:\d{2}/)  # ISO timestamp
    
    # Try to parse it as a time to see if it's valid
    begin
      Time.parse(timestamp)
      true
    rescue ArgumentError
      false
    end
  end

  def parse_timestamp_for_sorting(timestamp)
    return Time.at(0) if timestamp.nil? || timestamp.empty?
    
    # Handle different timestamp formats
    case timestamp
    when /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/ # ISO format
      Time.parse(timestamp)
    when /^\d{4}-\d{2}-\d{2}/ # Date only
      Time.parse(timestamp)
    when /^\d{10}$/ # Unix timestamp (seconds)
      Time.at(timestamp.to_i)
    when /^\d{13}$/ # Unix timestamp (milliseconds)
      Time.at(timestamp.to_i / 1000.0)
    else
      # Try general parsing, fallback to epoch if it fails
      begin
        Time.parse(timestamp)
      rescue ArgumentError
        # For non-parseable strings (like UUIDs), use epoch time so they sort to bottom
        Time.at(0)
      end
    end
  end

  def format_timestamp(timestamp)
    return timestamp if timestamp.nil? || timestamp.empty?
    
    # If it looks like a UUID or random string, don't try to parse it as time
    if timestamp.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      return timestamp[0..7] # Show first 8 chars of UUID
    end
    
    # If timestamp is already nicely formatted, return as-is
    return timestamp if timestamp.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    
    # Try to parse various timestamp formats
    begin
      time = case timestamp
      when /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/ # ISO format
        Time.parse(timestamp)
      when /^\d{4}-\d{2}-\d{2}/ # Date only
        Time.parse(timestamp)
      when /^\d{10}$/ # Unix timestamp (seconds)
        Time.at(timestamp.to_i)
      when /^\d{13}$/ # Unix timestamp (milliseconds)
        Time.at(timestamp.to_i / 1000.0)
      else
        # Try general parsing
        Time.parse(timestamp)
      end
      
      # Format the time nicely
      time.strftime("%Y-%m-%d %H:%M")
    rescue ArgumentError, TypeError
      # If parsing fails, return the first 16 chars or the whole string if shorter
      timestamp.length > 16 ? timestamp[0..15] + "..." : timestamp
    end
  end

  def format_relative_time(time)
    now = Time.now
    diff = now - time
    
    case diff
    when 0...60
      "#{diff.to_i} seconds ago"
    when 60...3600
      minutes = (diff / 60).to_i
      "#{minutes} minute#{minutes == 1 ? '' : 's'} ago"
    when 3600...86400
      hours = (diff / 3600).to_i
      "#{hours} hour#{hours == 1 ? '' : 's'} ago"
    when 86400...604800
      days = (diff / 86400).to_i
      "#{days} day#{days == 1 ? '' : 's'} ago"
    when 604800...2419200
      weeks = (diff / 604800).to_i
      "#{weeks} week#{weeks == 1 ? '' : 's'} ago"
    else
      months = (diff / 2419200).to_i
      "#{months} month#{months == 1 ? '' : 's'} ago"
    end
  end

  def extract_first_user_input_for_summary(entry)
    message = entry['message']
    content = message['content']
    
    # Extract text content
    if content.is_a?(Array)
      # Skip tool result messages
      regular_content = content.select { |item| item['type'] != 'tool_result' }
      return 'Untitled' if regular_content.empty?
      
      content_text = regular_content.first
      if content_text.is_a?(Hash) && content_text['type'] == 'text'
        content = content_text['text']
      else
        content = content_text['content'] || content_text.to_json
      end
    end
    
    # Skip command messages
    return 'Untitled' if content.match(/<command-name>([^<]+)<\/command-name>/)
    
    # Skip special messages
    return 'Untitled' if content == "[Request interrupted by user for tool use]"
    return 'Untitled' if content.match(/<local-command-stdout><\/local-command-stdout>/)
    
    # Found actual user input
    # Store up to 200 characters, display first 50
    stored_content = content.length > 200 ? content[0...200] : content
    display_content = stored_content.length > 50 ? stored_content[0...50] : stored_content
    
    display_content
  end

  def select_from_list(items, prompt)
    return nil if items.empty?

    selected_index = 0
    filter = ""

    # Check if items are session objects or strings
    is_session_list = items.first.is_a?(Hash) && items.first.key?(:summary)

    # Save terminal state and prepare for raw input
    begin
      $stdin.raw do |io|
        loop do
          # Clear screen and reset cursor
          print "\033[2J\033[H"
          
          if is_session_list
            # Session list display with Claude Code format
            print "  \033[1mModified      Created       # Messages  Summary\033[0m\r\n"
            
            # Get filtered items
            filtered_items = if filter.empty?
              items.each_with_index.to_a
            else
              items.each_with_index.select { |item, _| item[:summary].downcase.include?(filter.downcase) }
            end

            # Display items with selection indicator
            filtered_items.each_with_index do |(item, original_index), display_index|
              modified_str = format_relative_time(item[:modified]).ljust(13)
              created_str = format_relative_time(item[:created]).ljust(13)
              message_count_str = item[:message_count].to_s.rjust(10)
              
              # Truncate summary to fit
              summary = item[:summary]
              summary = summary[0..42] + "..." if summary.length > 45
              
              display_line = "#{modified_str} #{created_str} #{message_count_str}  #{summary}"
              
              if display_index == selected_index
                print "\033[46m\033[30m❯ #{display_line.ljust(77)}\033[0m\r\n"
              else
                print "  #{display_line}\r\n"
              end
            end

            # Handle empty filter results
            if filtered_items.empty?
              print "\033[31m  (No matches found)\033[0m\r\n"
            end

            # Show filter and instructions
            print "\r\n"
            if !filter.empty?
              print "\033[33mFilter: #{filter}\033[0m\r\n"
            end
            print "\033[2mUse ↑/↓ arrows to navigate, type to filter, Enter to select, Esc to quit\033[0m\r\n"
            print "\033[2m#{filtered_items.length} of #{items.length} sessions\033[0m\r\n"
          else
            # Regular string list display
            print "┌─────────────────────────────────────────────────────────────┐\r\n"
            print "│ \033[1m#{prompt.ljust(59)}\033[0m │\r\n"
            print "├─────────────────────────────────────────────────────────────┤\r\n"
            print "│ \033[2mUse ↑/↓ arrows to navigate, type to filter, Enter to select\033[0m │\r\n"
            print "│ \033[2mPress Esc to quit\033[0m                                     │\r\n"
            
            if filter.empty?
              print "├─────────────────────────────────────────────────────────────┤\r\n"
            else
              print "├─────────────────────────────────────────────────────────────┤\r\n"
              print "│ \033[33mFilter: #{filter.ljust(49)}\033[0m │\r\n"
            end
            
            print "└─────────────────────────────────────────────────────────────┘\r\n"
            print "\r\n"

            # Get filtered items
            filtered_items = if filter.empty?
              items.each_with_index.to_a
            else
              items.each_with_index.select { |item, _| item.downcase.include?(filter.downcase) }
            end

            # Display items with selection indicator
            filtered_items.each_with_index do |(item, original_index), display_index|
              # Truncate long items to fit in display
              display_item = item.length > 75 ? item[0..71] + "..." : item
              
              if display_index == selected_index
                print "\033[46m\033[30m❯ #{display_item.ljust(77)}\033[0m\r\n"
              else
                print "  #{display_item}\r\n"
              end
            end

            # Handle empty filter results
            if filtered_items.empty?
              print "\033[31m  (No matches found)\033[0m\r\n"
            end

            # Show count
            print "\r\n"
            print "\033[2m#{filtered_items.length} of #{items.length} items\033[0m\r\n"
          end

          $stdout.flush

          # Read input
          char = io.getch
          
          case char
          when "\e" # Escape sequences
            begin
              next_char = io.read_nonblock(1)
              if next_char == "["
                arrow = io.read_nonblock(1)
                case arrow
                when "A" # Up arrow
                  selected_index = [selected_index - 1, 0].max
                when "B" # Down arrow
                  selected_index = [selected_index + 1, filtered_items.length - 1].min
                end
              end
            rescue IO::WaitReadable
              # Just escape key - quit
              print "\033[2J\033[H"
              return nil
            end
          when "\r", "\n" # Enter
            print "\033[2J\033[H"
            return items[filtered_items[selected_index][1]] if filtered_items.any?
          when "\u007F", "\b" # Backspace
            filter = filter[0...-1] unless filter.empty?
            selected_index = 0
          when "\u0003" # Ctrl+C
            print "\033[2J\033[H"
            exit 0
          else
            # Regular character - add to filter
            if char =~ /[[:print:]]/
              filter += char
              selected_index = 0
            end
          end
        end
      end
    ensure
      # Restore terminal to normal mode
      print "\033[2J\033[H"
      $stdout.flush
    end
  end
end

# Main execution
if $stdin.tty?
  # No piped input - show TUI
  browser = SessionBrowser.new
  browser.run
else
  # Piped input - process as before
  input = $stdin.read
  converter = SessionToMarkdown.new(input)
  puts converter.convert
end