#!/usr/bin/env ruby

require 'json'
require 'pathname'
require 'io/console'
require 'time'

# Language detection mappings
LANGUAGE_BY_EXTENSION = {
  'js' => 'javascript', 'jsx' => 'javascript',
  'ts' => 'typescript', 'tsx' => 'typescript',
  'rb' => 'ruby', 'ruby' => 'ruby',
  'py' => 'python', 'python' => 'python',
  'cpp' => 'cpp', 'cc' => 'cpp', 'cxx' => 'cpp', 'c++' => 'cpp', 'hpp' => 'cpp', 'h' => 'cpp',
  'c' => 'c',
  'java' => 'java',
  'go' => 'go',
  'rs' => 'rust',
  'php' => 'php',
  'sh' => 'bash', 'bash' => 'bash',
  'sql' => 'sql',
  'json' => 'json',
  'yaml' => 'yaml', 'yml' => 'yaml',
  'xml' => 'xml',
  'html' => 'html',
  'css' => 'css',
  'md' => 'markdown'
}.freeze

SPECIAL_FILE_LANGUAGES = {
  'CMakeLists.txt' => 'cmake',
  'Makefile' => 'makefile'
}.freeze

# Message wrapper for cleaner handling
class Message
  attr_reader :data, :type, :content, :is_meta, :tool_use_result

  def initialize(data)
    @data = data
    @type = data['type']
    @is_meta = data['isMeta']
    @tool_use_result = data['toolUseResult']
    @message = data['message'] || {}
    @content = @message['content']
  end

  def content_array?
    @content.is_a?(Array)
  end

  def text_content
    return @content unless content_array?
    
    @content.select { |item| item['type'] == 'text' }
            .map { |item| item['text'] }
            .join("\n")
  end

  def tool_results
    return [] unless content_array?
    @content.select { |item| item['type'] == 'tool_result' }
  end

  def tool_uses
    return [] unless content_array?
    @content.select { |item| item['type'] == 'tool_use' }
  end

  def regular_content
    return [] unless content_array?
    @content.reject { |item| item['type'] == 'tool_result' }
  end

  def caveat_message?
    return false unless @is_meta
    
    if @content.is_a?(String)
      @content.start_with?("Caveat:")
    elsif content_array?
      text_contents = @content.select { |item| item['type'] == 'text' }
      text_contents.any? { |item| item['text']&.start_with?("Caveat:") }
    else
      false
    end
  end

  def command?
    return false unless @content.is_a?(String)
    @content.match?(/<command-name>([^<]+)<\/command-name>/)
  end

  def extract_command
    return nil unless command?
    
    command_name = @content.match(/<command-name>([^<]+)<\/command-name>/)[1]
    command_args_match = @content.match(/<command-args>([^<]*)<\/command-args>/)
    command_args = command_args_match ? command_args_match[1] : ""
    
    { name: command_name, args: command_args }
  end

  def api_error?
    @data['isApiErrorMessage']
  end

  def empty_command_output?
    @content.is_a?(String) && @content.match?(/<local-command-stdout><\/local-command-stdout>/)
  end

  def interruption_message?
    @content == "[Request interrupted by user for tool use]"
  end
end

# Terminal UI module
module TerminalUI
  def self.clear_screen
    print "\033[2J\033[H"
  end

  def self.select_from_list(items, prompt)
    return nil if items.empty?

    selected_index = 0
    filter = ""
    is_session_list = items.first.is_a?(Hash) && items.first.key?(:summary)

    $stdin.raw do |io|
      loop do
        clear_screen
        
        filtered_items = filter_items(items, filter)
        
        if is_session_list
          display_session_list(filtered_items, selected_index, filter)
        else
          display_string_list(filtered_items, selected_index, prompt, filter, items.length)
        end

        $stdout.flush

        # Handle input
        action = read_user_input(io)
        
        case action[:type]
        when :quit
          clear_screen
          return nil
        when :select
          clear_screen
          return items[filtered_items[selected_index][1]] if filtered_items.any?
        when :up
          selected_index = [selected_index - 1, 0].max
        when :down
          selected_index = [selected_index + 1, filtered_items.length - 1].min
        when :backspace
          filter = filter[0...-1] unless filter.empty?
          selected_index = 0
        when :char
          filter += action[:char]
          selected_index = 0
        end
      end
    end
  ensure
    clear_screen
    $stdout.flush
  end

  private

  def self.filter_items(items, filter)
    return items.each_with_index.to_a if filter.empty?
    
    if items.first.is_a?(Hash) && items.first.key?(:summary)
      items.each_with_index.select { |item, _| item[:summary].downcase.include?(filter.downcase) }
    else
      items.each_with_index.select { |item, _| item.downcase.include?(filter.downcase) }
    end
  end

  def self.display_session_list(filtered_items, selected_index, filter)
    print "  \033[1mModified      Created       # Messages  Summary\033[0m\r\n"
    
    filtered_items.each_with_index do |(item, original_index), display_index|
      modified_str = format_relative_time(item[:modified]).ljust(13)
      created_str = format_relative_time(item[:created]).ljust(13)
      message_count_str = item[:message_count].to_s.rjust(10)
      
      summary = item[:summary]
      summary = summary[0..42] + "..." if summary.length > 45
      
      display_line = "#{modified_str} #{created_str} #{message_count_str}  #{summary}"
      
      if display_index == selected_index
        print "\033[46m\033[30m❯ #{display_line.ljust(77)}\033[0m\r\n"
      else
        print "  #{display_line}\r\n"
      end
    end

    print_session_footer(filtered_items, filter)
  end

  def self.display_string_list(filtered_items, selected_index, prompt, filter, total_count)
    print_string_list_header(prompt, filter)
    
    filtered_items.each_with_index do |(item, original_index), display_index|
      display_item = item.length > 75 ? item[0..71] + "..." : item
      
      if display_index == selected_index
        print "\033[46m\033[30m❯ #{display_item.ljust(77)}\033[0m\r\n"
      else
        print "  #{display_item}\r\n"
      end
    end

    print_string_list_footer(filtered_items, total_count)
  end

  def self.print_session_footer(filtered_items, filter)
    if filtered_items.empty?
      print "\033[31m  (No matches found)\033[0m\r\n"
    end
    
    print "\r\n"
    print "\033[33mFilter: #{filter}\033[0m\r\n" unless filter.empty?
    print "\033[2mUse ↑/↓ arrows to navigate, type to filter, Enter to select, Esc to quit\033[0m\r\n"
    print "\033[2m#{filtered_items.length} sessions\033[0m\r\n"
  end

  def self.print_string_list_header(prompt, filter)
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
  end

  def self.print_string_list_footer(filtered_items, total_count)
    if filtered_items.empty?
      print "\033[31m  (No matches found)\033[0m\r\n"
    end
    
    print "\r\n"
    print "\033[2m#{filtered_items.length} of #{total_count} items\033[0m\r\n"
  end

  def self.read_user_input(io)
    char = io.getch
    
    case char
    when "\e" # Escape sequences
      handle_escape_sequence(io)
    when "\r", "\n"
      { type: :select }
    when "\u007F", "\b"
      { type: :backspace }
    when "\u0003" # Ctrl+C
      clear_screen
      exit 0
    else
      if char =~ /[[:print:]]/
        { type: :char, char: char }
      else
        { type: :unknown }
      end
    end
  end

  def self.handle_escape_sequence(io)
    begin
      next_char = io.read_nonblock(1)
      if next_char == "["
        arrow = io.read_nonblock(1)
        case arrow
        when "A" then { type: :up }
        when "B" then { type: :down }
        else { type: :unknown }
        end
      else
        { type: :unknown }
      end
    rescue IO::WaitReadable
      { type: :quit }
    end
  end

  def self.format_relative_time(time)
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
end

class SessionToMarkdown
  def initialize(input)
    @input = input
    @output = []
    @pending_tools = []
    @pending_tool_results = []
    @tool_call_map = {}
    @current_cwd = nil
    @current_assistant_message = nil
    @current_tool_use_result = nil
  end

  def convert
    messages = parse_messages
    
    messages.each_with_index do |data, index|
      begin
        process_message(data, messages, index)
      rescue => e
        $stderr.puts "Error processing message at index #{index}: #{e.message}"
        $stderr.puts "Message data: #{data.to_json}"
        $stderr.puts "Backtrace: #{e.backtrace.join("\n")}"
        raise e
      end
    end
    
    flush_pending_tool_results
    @output.join("\n")
  end

  private

  def parse_messages
    messages = []
    
    @input.strip.split("\n").each do |line|
      next if line.strip.empty?
      
      begin
        messages << JSON.parse(line)
      rescue => e
        $stderr.puts "Error parsing JSON line: #{e.message}"
        $stderr.puts "Offending line: #{line}"
        raise e
      end
    end
    
    messages
  end

  def strip_line_numbers(content)
    content.split("\n").map { |line| line.sub(/^\s*\d+→/, '') }.join("\n")
  end

  def make_relative_path(path)
    return path unless @current_cwd && path
    
    begin
      pathname = Pathname.new(path)
      cwd_pathname = Pathname.new(@current_cwd)
      pathname.relative_path_from(cwd_pathname).to_s
    rescue ArgumentError
      path
    end
  rescue
    path
  end

  def process_message(data, messages, index)
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
    summary = generate_summary_from_first_user_input
    @output << "# #{summary}"
    @output << ""
  end

  def process_user_message(data, messages, index)
    message = Message.new(data)
    
    # Early returns for special cases
    return if message.caveat_message?
    return if message.api_error?
    
    # Handle meta messages
    if message.is_meta
      handle_meta_message(message)
      return
    end
    
    # Store tool use result if present
    @current_tool_use_result = message.tool_use_result
    
    # Handle different message types
    if message.content_array?
      handle_array_message(message, messages, index)
    else
      handle_string_message(message)
    end
  end

  def handle_meta_message(message)
    content_text = message.text_content
    return if content_text.empty?
    
    summary_text = content_text.split("\n").first || content_text
    summary_text = summary_text[0..50] + "..." if summary_text.length > 50
    
    @output << "<details><summary>#{summary_text}</summary>"
    @output << ""
    content_text.split("\n").each { |line| @output << "> #{line}" }
    @output << ""
    @output << "</details>"
    @output << ""
  end

  def handle_array_message(message, messages, index)
    tool_results = message.tool_results
    regular_content = message.regular_content
    
    if tool_results.any?
      handle_tool_results(tool_results, messages, index)
    end
    
    if regular_content.any? && !message.interruption_message?
      output_user_content(regular_content)
    end
  end

  def handle_tool_results(tool_results, messages, index)
    error_results = tool_results.select { |result| result['is_error'] }
    
    if error_results.any?
      @output << "**❌ User cancelled tool execution**"
      @output << ""
    else
      @pending_tool_results.concat(tool_results)
      
      # Check if next message continues tool results
      next_message = messages[index + 1]
      is_continuing = next_message && 
                     next_message['type'] == 'user' && 
                     Message.new(next_message).tool_results.any?
      
      flush_pending_tool_results unless is_continuing
    end
  end

  def handle_string_message(message)
    return if message.empty_command_output?
    
    if command = message.extract_command
      handle_command_message(command)
    else
      output_user_content([{ 'text' => message.content }])
    end
  end

  def handle_command_message(command)
    if command[:name] == "/clear"
      @output << "**🧹 User cleared the session**"
      @output << ""
      return
    end
    
    @output << "### User"
    @output << ""
    
    if command[:args].empty?
      @output << "> #{command[:name]}"
    else
      @output << "> #{command[:name]} \"#{command[:args]}\""
    end
    
    @output << ""
  end

  def output_user_content(content_items)
    @output << "### User"
    @output << ""
    
    content_items.each do |content_item|
      text = extract_text_from_content_item(content_item)
      text.split("\n").each { |line| @output << "> #{line}" }
    end
    
    @output << ""
  end

  def extract_text_from_content_item(content_item)
    if content_item.is_a?(Hash) && content_item['type'] == 'text'
      content_item['text']
    else
      content_item['content'] || content_item.to_json
    end
  end

  def process_assistant_message(data, messages, index)
    message = Message.new(data)
    
    return if message.api_error?
    
    if message.content_array?
      handle_assistant_array_content(message, messages, index)
    else
      output_assistant_text(message.content)
    end
  end

  def handle_assistant_array_content(message, messages, index)
    text_content = message.content.select { |item| item['type'] == 'text' }
    tool_uses = message.tool_uses
    
    if tool_uses.any?
      # Output text if present
      if text_content.any?
        @output << "### Assistant"
        @output << ""
        text_content.each do |content_item|
          @output << content_item['text']
          @output << ""
        end
      end
      
      # Store tool uses for later display with results
      tool_uses.each do |tool_use|
        @pending_tools << tool_use
        @tool_call_map[tool_use['id']] = tool_use
      end
    elsif text_content.any?
      output_assistant_text_items(text_content)
    end
  end

  def output_assistant_text(text)
    @output << "### Assistant"
    @output << ""
    @output << text
    @output << ""
  end

  def output_assistant_text_items(text_items)
    @output << "### Assistant"
    @output << ""
    text_items.each do |content_item|
      @output << content_item['text']
      @output << ""
    end
  end

  def flush_pending_tool_results
    return if @pending_tool_results.empty?
    
    @pending_tool_results.each do |tool_result|
      format_tool_result(tool_result)
    end
    
    @pending_tool_results.clear
    @pending_tools.clear
    @current_tool_use_result = nil
  end

  def format_tool_result(tool_result)
    content = tool_result['content']
    tool_use_id = tool_result['tool_use_id']
    tool_call = @tool_call_map[tool_use_id]
    
    # Check for structured patch
    if @current_tool_use_result.is_a?(Hash) && @current_tool_use_result['structuredPatch']
      format_structured_patch
      return
    end
    
    # Special handling for TodoWrite
    if tool_call && tool_call['name'] == 'TodoWrite'
      format_todo_write(tool_call)
      return
    end
    
    # Regular tool result
    format_regular_tool_result(content, tool_use_id)
  end

  def format_structured_patch
    file_path = @current_tool_use_result['filePath']
    structured_patch = @current_tool_use_result['structuredPatch']
    relative_path = make_relative_path(file_path)
    
    @output << "**Edit:** `#{relative_path}`"
    @output << ""
    @output << "```diff"
    
    structured_patch.each do |hunk|
      hunk['lines'].each { |line| @output << line }
    end
    
    @output << "```"
    @output << ""
  end

  def format_todo_write(tool_call)
    @output << "**Updated task list**"
    @output << ""
    @output << format_todo_list(tool_call['input'])
    @output << ""
  end

  def format_regular_tool_result(content, tool_use_id)
    tool_summary = create_tool_result_list_summary(content, tool_use_id)
    
    @output << "<details><summary>#{tool_summary}</summary>"
    @output << ""
    
    format_tool_content(content, tool_use_id)
    
    @output << "</details>"
    @output << ""
  end

  def format_tool_content(content, tool_use_id)
    tool_call = @tool_call_map[tool_use_id]
    
    if content.is_a?(Array)
      format_array_content(content)
    elsif should_truncate_ls?(tool_call)
      format_truncated_content(content)
    elsif content.match?(/^\s*\d+→/)
      format_file_content(content, tool_call)
    elsif code_content?(content)
      format_code_content(content)
    else
      format_plain_content(content)
    end
  end

  def should_truncate_ls?(tool_call)
    return false unless tool_call
    tool_call['name'] == 'LS' || 
    (tool_call['name'] == 'Bash' && tool_call['input']['command']&.match?(/^(ls|LS)(\s|$)/))
  end

  def format_array_content(content)
    content.each do |content_item|
      if content_item['type'] == 'text'
        @output << content_item['text']
        @output << ""
      end
    end
  end

  def format_truncated_content(content)
    @output << "```"
    lines = content.split("\n")
    
    if lines.length > 50
      @output << lines.first(50).join("\n")
      @output << "\n... (#{lines.length - 50} more lines)"
    else
      @output << content
    end
    
    @output << "```"
  end

  def format_file_content(content, tool_call)
    file_path = tool_call&.dig('input', 'file_path')
    language = file_path ? detect_language_from_path(file_path) : ""
    
    @output << "```#{language}"
    @output << strip_line_numbers(content)
    @output << "```"
  end

  def format_code_content(content)
    language = detect_code_language(content)
    @output << "```#{language}"
    @output << content
    @output << "```"
  end

  def format_plain_content(content)
    @output << "```"
    @output << content
    @output << "```"
  end

  def code_content?(content)
    content.match?(/^(Found \d+ files|\/.*\..*$)/) ||
    content.match?(/^\s*(import|export|function|const|let|var|class|interface|type)/)
  end

  def detect_code_language(content)
    return "" unless content.match?(/^\s*(import|export|function|const|let|var|class|interface|type)/)
    "typescript"
  end

  def create_tool_result_list_summary(content, tool_use_id)
    tool_call = @tool_call_map[tool_use_id]
    
    return create_content_based_summary(content) unless tool_call
    
    tool_name = tool_call['name']
    tool_input = tool_call['input']
    
    case tool_name
    when 'TodoWrite'
      "<b>TodoWrite:</b> Updated task list"
    when 'Read'
      format_read_summary(tool_input)
    when 'Grep'
      format_grep_summary(tool_input)
    when 'Edit'
      "<b>Edit:</b> <code>#{make_relative_path(tool_input['file_path'])}</code>"
    when 'Bash'
      format_bash_summary(tool_input)
    when 'Write'
      "<b>Write:</b> <code>#{make_relative_path(tool_input['file_path'])}</code>"
    when 'LS'
      format_ls_summary(tool_input)
    else
      "<b>#{tool_name}:</b> #{format_tool_input_html(tool_input)}"
    end
  end

  def format_read_summary(input)
    file_path = make_relative_path(input['file_path']) || 'unknown file'
    limit = input['limit']
    
    if limit
      "<b>Read:</b> <code>#{file_path}, limit: #{limit}</code>"
    else
      "<b>Read:</b> <code>#{file_path}</code>"
    end
  end

  def format_grep_summary(input)
    pattern = input['pattern']
    path = input['path'] ? make_relative_path(input['path']) : 'current directory'
    include_filter = input['include']
    
    if include_filter
      "<b>Grep:</b> pattern <code>#{pattern}</code> in <code>#{path}</code> (#{include_filter})"
    else
      "<b>Grep:</b> pattern <code>#{pattern}</code> in <code>#{path}</code>"
    end
  end

  def format_bash_summary(input)
    command = input['command']
    display_command = command.start_with?('LS ') ? command.sub(/^LS /, 'ls ') : command
    display_command = display_command == 'LS' ? 'ls' : display_command
    "<b>Bash:</b> <code>#{display_command}</code>"
  end

  def format_ls_summary(input)
    path = input['path'] ? make_relative_path(input['path']) : 'current directory'
    "<b>ls:</b> <code>#{path}</code>"
  end

  def create_content_based_summary(content)
    case content
    when /^\s*\d+→/
      lines = content.split("\n")
      "<b>Read:</b> file content (#{lines.length} lines)"
    when /^Found \d+ files/
      "<b>Search:</b> #{content.split("\n").first}"
    when /^\/.*\..*$/
      "<b>Search:</b> found #{content.split("\n").length} file(s)"
    when /^(.*has been updated|.*created successfully|.*deleted successfully)/
      "<b>Edit:</b> #{content.split("\n").first}"
    when /^(Tool ran without output|Command completed)/
      "<b>Command:</b> executed successfully"
    when /^Received \d+/
      "<b>Fetch:</b> #{content.split("\n").first}"
    else
      "<b>Tool result:</b> #{content.length} characters"
    end
  end

  def format_tool_input_html(input)
    return "<code>#{input}</code>" unless input.is_a?(Hash)
    
    if input.size == 1
      key, value = input.first
      "<code>#{value}</code>"
    else
      formatted_pairs = input.map { |k, v| "#{k}: #{v}" }
      "<code>#{formatted_pairs.join(', ')}</code>"
    end
  end

  def format_todo_list(input)
    return "" unless input && input['todos']
    
    input['todos'].map do |todo|
      checkbox = todo['status'] == 'completed' ? '[x]' : '[ ]'
      status_indicator = todo['status'] == 'in_progress' ? ' (in progress)' : ''
      "- #{checkbox} #{todo['content']}#{status_indicator}"
    end.join("\n")
  end

  def detect_language_from_path(path)
    return "" unless path
    
    # Check special files first
    basename = File.basename(path)
    return SPECIAL_FILE_LANGUAGES[basename] if SPECIAL_FILE_LANGUAGES[basename]
    
    # Check extension
    extension = path[/\.([^.]+)$/i, 1]&.downcase
    LANGUAGE_BY_EXTENSION[extension] || ""
  end

  def generate_summary_from_first_user_input
    @input.strip.split("\n").each do |line|
      next if line.strip.empty?
      
      begin
        data = JSON.parse(line)
        next unless data['type'] == 'user' && !data['isMeta']
        
        message = Message.new(data)
        next if message.command?
        next if message.interruption_message?
        next if message.empty_command_output?
        
        # Skip tool result messages
        if message.content_array?
          regular_content = message.regular_content
          next if regular_content.empty?
        end
        
        # Extract text content
        content_text = message.text_content
        next if content_text.empty?
        
        # Return first 50 chars
        return content_text.length > 50 ? content_text[0...50] : content_text
      rescue
        next
      end
    end
    
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
      projects = get_projects
      
      if projects.empty?
        puts "No projects found in #{@claude_projects_dir}"
        exit 1
      end

      project_display_names = create_display_names(projects)
      selected_project_display = TerminalUI.select_from_list(project_display_names, "Select a project:")
      
      return unless selected_project_display
      
      project_index = project_display_names.index(selected_project_display)
      selected_project = projects[project_index]
      
      process_project(selected_project)
    end
  end

  private

  def get_projects
    Dir.entries(@claude_projects_dir)
       .reject { |d| d.start_with?('.') }
       .select { |d| File.directory?(File.join(@claude_projects_dir, d)) }
       .sort
  end

  def create_display_names(projects)
    projects.map do |project|
      project.gsub('-Users-mnutt-p-', '')
             .gsub('-', '/')
             .gsub('_', ' ')
    end
  end

  def process_project(project)
    project_dir = File.join(@claude_projects_dir, project)
    jsonl_files = Dir.glob(File.join(project_dir, "*.jsonl")).sort.reverse
    
    if jsonl_files.empty?
      puts "No session files found in #{project_dir}"
      return
    end
    
    sessions = build_session_list(jsonl_files)
    sessions.sort! { |a, b| compare_sessions(a, b) }
    
    selected_session = TerminalUI.select_from_list(sessions, "Select a session:")
    return unless selected_session
    
    process_session(selected_session[:file])
  end

  def process_session(session_file)
    input = File.read(session_file)
    converter = SessionToMarkdown.new(input)
    output = converter.convert
    puts output
    
    copy_to_clipboard(output)
    exit 0  # Exit after processing
  end

  def copy_to_clipboard(output)
    return unless system("which pbcopy > /dev/null 2>&1")
    
    IO.popen("pbcopy", "w") { |pipe| pipe.write(output) }
    puts "\n📋 Copied to clipboard"
  end

  def compare_sessions(a, b)
    time_a = parse_timestamp_for_sorting(a[:timestamp])
    time_b = parse_timestamp_for_sorting(b[:timestamp])
    time_b <=> time_a
  rescue
    b[:timestamp] <=> a[:timestamp]
  end

  def build_session_list(jsonl_files)
    jsonl_files.map { |file| build_session_info(file) }
  end

  def build_session_info(file)
    timestamp = nil
    summary = 'Untitled'
    message_count = 0
    
    File.open(file) do |f|
      while !f.eof?
        line = f.readline
        entry = JSON.parse(line)
        
        if entry['type'] == 'user' || entry['type'] == 'assistant'
          message_count += 1
        end
        
        if timestamp.nil? && entry['timestamp'] && valid_timestamp?(entry['timestamp'])
          timestamp = entry['timestamp']
        end
        
        if summary == 'Untitled' && entry['type'] == 'user' && !entry['isMeta']
          summary = extract_summary_from_entry(entry)
        end
        
        break if timestamp && summary != 'Untitled'
      end
    end
    
    timestamp ||= File.basename(file).sub('.jsonl', '')
    mtime = File.mtime(file)
    
    {
      file: file,
      timestamp: timestamp,
      summary: summary,
      message_count: message_count,
      modified: mtime,
      created: mtime
    }
  rescue => e
    {
      file: file,
      timestamp: File.basename(file).sub('.jsonl', ''),
      summary: 'Error reading file',
      message_count: 0,
      modified: File.mtime(file),
      created: File.mtime(file)
    }
  end

  def valid_timestamp?(timestamp)
    return false if timestamp.nil? || timestamp.empty?
    return false if timestamp.match?(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
    
    return true if timestamp.match?(/^\d{4}-\d{2}-\d{2}/)
    return true if timestamp.match?(/^\d{10,13}$/)
    return true if timestamp.match?(/T\d{2}:\d{2}:\d{2}/)
    
    begin
      Time.parse(timestamp)
      true
    rescue ArgumentError
      false
    end
  end

  def parse_timestamp_for_sorting(timestamp)
    return Time.at(0) if timestamp.nil? || timestamp.empty?
    
    case timestamp
    when /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      Time.parse(timestamp)
    when /^\d{4}-\d{2}-\d{2}/
      Time.parse(timestamp)
    when /^\d{10}$/
      Time.at(timestamp.to_i)
    when /^\d{13}$/
      Time.at(timestamp.to_i / 1000.0)
    else
      begin
        Time.parse(timestamp)
      rescue ArgumentError
        Time.at(0)
      end
    end
  end

  def extract_summary_from_entry(entry)
    message = Message.new(entry)
    
    return 'Untitled' if message.command?
    return 'Untitled' if message.interruption_message?
    return 'Untitled' if message.empty_command_output?
    
    if message.content_array?
      regular_content = message.regular_content
      return 'Untitled' if regular_content.empty?
    end
    
    content_text = message.text_content
    return 'Untitled' if content_text.empty?
    
    content_text.length > 50 ? content_text[0...50] : content_text
  end
end

# Main execution
if $stdin.tty?
  browser = SessionBrowser.new
  browser.run
else
  input = $stdin.read
  converter = SessionToMarkdown.new(input)
  puts converter.convert
end