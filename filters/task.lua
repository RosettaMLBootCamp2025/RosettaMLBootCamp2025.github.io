function Span(el)
  if el.classes:includes('task') then
    local id = el.attributes['module-id']
    -- If content is empty, default to "Mark as complete"?
    -- But the markdown will be [Label]{.task ...} so content is Label.
    local label = pandoc.utils.stringify(el.content)
    if label == "" then label = "Mark as complete" end
    
    return pandoc.RawInline('html', '<input type="checkbox" class="module-checkbox" data-module-id="' .. id .. '"> ' .. label)
  end
end