#!/usr/bin/env ruby

require 'json'
require 'pathname'

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
    @output << "# #{data['summary']}"
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
      
      # Handle special command formats
      if content.match(/<command-name>\/clear<\/command-name>/)
        @output << "**🧹 User cleared the session**"
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
          elsif content.match(/^\s*\d+→/)
            # File read result with line numbers
            language = detect_language(content)
            @output << "```#{language}"
            @output << content
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
        "<b>Bash:</b> <code>#{command}</code>"
      when 'Write'
        file_path = make_relative_path(tool_input['file_path']) || 'unknown file'
        "<b>Write:</b> <code>#{file_path}</code>"
      when 'Fetch'
        url = tool_input['url']
        "<b>Fetch:</b> <code>#{url}</code>"
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
      @output << "```#{language}"
      @output << content
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
end

# Read from STDIN
input = $stdin.read

# Convert and output
converter = SessionToMarkdown.new(input)
puts converter.convert