local task_count = 0

local function escape_html(value)
  return tostring(value or '')
    :gsub('&', '&amp;')
    :gsub('<', '&lt;')
    :gsub('>', '&gt;')
    :gsub('"', '&quot;')
    :gsub("'", '&#39;')
end

local function checkbox_id(module_id)
  local safe_id = tostring(module_id or '')
    :lower()
    :gsub('[^%w%-_:.]', '-')
    :gsub('%-+', '-')
    :gsub('^%-', '')
    :gsub('%-$', '')

  task_count = task_count + 1
  if safe_id == '' then safe_id = tostring(task_count) end
  return 'module-checkbox-' .. safe_id
end

function Span(el)
  if not el.classes:includes('task') then return nil end

  local module_id = el.attributes['module-id'] or ''
  local label = pandoc.utils.stringify(el.content)
  if label == '' then label = 'Mark as complete' end

  local input_id = checkbox_id(module_id)
  local html = table.concat({
    '<label class="module-task" for="', escape_html(input_id), '">',
    '<input type="checkbox" class="module-checkbox" id="', escape_html(input_id),
    '" data-module-id="', escape_html(module_id), '">',
    '<span>', escape_html(label), '</span>',
    '</label>'
  })

  return pandoc.RawInline('html', html)
end
