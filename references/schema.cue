package wise

Deployment: {
  name: string
  resources?: [...Resource]
  ai_generate?: {
    enabled: bool | *true
    goal: string
    constraints?: {
      max_resources?: int & >=1
      required_fields?: [...string]
      preferred_output?: "csv" | "jsonl" | "json"
    }
  }
  hooks?: Hooks
  schedule?: Schedule
}

Resource: {
  name: string
  entry: Entry
  globals?: Globals
  selectors: [...Selector]
  inputs?: [...InputBinding]
  outputs?: [...OutputBinding]
}

InputBinding: {
  name: string
  artifact: string
}

OutputBinding: {
  artifact: string
  from: string
}

Entry: {
  url: string | ArtifactRef
  root: string
}

ArtifactRef: {
  artifact: string
}

Globals: {
  timeout_ms?: int & >=0
  retries?: int & >=0
  user_agent?: string
}

Schedule: {
  cron?: string
  interval_seconds?: int & >0
}

Hooks: {
  before?: [...Hook]
  after?: [...Hook]
}

Hook: {
  name: string
  config?: {}
}

Selector: {
  name: string
  parents: [...string] | *[]
  context: Context
  selector?: string
  multiple?: bool
  element_limit?: int & >=0
  type?: "element" | "element-click" | "pagination" | "matrix" | "text" | "link" | "table" | "html" | "attribute" | "ai"
  interaction?: [...Interaction]
  extract?: [...Extraction]
  pagination?: Pagination
  matrix?: Matrix
  delay_ms?: int & >=0
  hooks?: { post_extract?: [...Hook] }
}

Context: {
  url?: string
  url_pattern?: string
  selector_exists?: string
  text_in_page?: string
  table_headers?: [...string]
}

Interaction: Click | Select | Scroll | Wait | Reveal

Click: {
  type: "click"
  target: Locator
  click_type?: "clickOnce" | "clickAll"
  click_action_type?: "real" | "scripted"
  click_element_uniqueness_type?: "uniqueText" | "uniqueCSSSelector" | "uniqueDomPath"
  discard_initial_elements?: "discard-when-click-element-exists" | "do-not-discard"
  delay_ms?: int & >=0
}

Select: {
  type: "select"
  target: Locator
  value: string
  delay_ms?: int & >=0
}

Scroll: {
  type: "scroll"
  direction: "down" | "up"
  amount_px?: int & >0
  delay_ms?: int & >=0
}

Wait: {
  type: "wait"
  ms?: int & >=0
  network_idle?: bool
  selector?: string
}

Reveal: {
  type: "reveal"
  target: Locator
  mode: "click" | "hover"
  delay_ms?: int & >=0
}

Locator: {
  css?: string
  text?: string
  role?: string
  name?: string
}

Extraction: Text | Attr | Table | HTML | Link | AIExtraction

Text: {
  type: "text"
  name: string
  selector: string
}

Attr: {
  type: "attr"
  name: string
  selector: string
  attr: string
}

HTML: {
  type: "html"
  name: string
  selector: string
}

Link: {
  type: "link"
  name: string
  selector: string
  attr?: string | *"href"
}

Table: {
  type: "table"
  name: string
  selector: string
  header_row?: int
  columns?: [...TableColumn]
}

TableColumn: {
  name: string
  header?: string
  index?: int
}

AIExtraction: {
  type: "ai"
  name: string
  prompt: string
}

Pagination: {
  pagination_type: "next" | "numeric" | "infinite"
  selector: string
  page_limit?: int & >=0
  start_page?: int & >=1
  stop_condition?: string
}

Matrix: {
  auto_discover?: bool
  axes: [...Axis]
}

Axis: {
  action: "type" | "select" | "checkbox"
  selector: string
  values: [...string] | "auto" | []
}
