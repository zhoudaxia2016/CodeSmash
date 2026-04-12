/**
 * Predicate-free highlights for tree-sitter-javascript (v0.25 wasm).
 * Avoids #match? / #eq? / #is-not? so web-tree-sitter WASM query + JS predicates cannot filter out all matches.
 * Kept as TS string so Vite never drops or empties a sidecar .scm?raw import.
 */
export const JAVASCRIPT_HIGHLIGHTS_SCM = `
(identifier) @variable
(property_identifier) @property

(function_expression
 name: (identifier) @function)
(function_declaration
 name: (identifier) @function)
(method_definition
 name: (property_identifier) @function.method)

(pair
 key: (property_identifier) @function.method
 value: [(function_expression) (arrow_function)])

(assignment_expression
 left: (member_expression
 property: (property_identifier) @function.method)
 right: [(function_expression) (arrow_function)])

(variable_declarator
 name: (identifier) @function
 value: [(function_expression) (arrow_function)])

(assignment_expression
 left: (identifier) @function
 right: [(function_expression) (arrow_function)])

(call_expression
 function: (identifier) @function)

(call_expression
 function: (member_expression
 property: (property_identifier) @function.method))

(this) @variable.builtin
(super) @variable.builtin

[
 (true)
 (false)
 (null)
 (undefined)
] @constant.builtin

(comment) @comment

[
 (string)
 (template_string)
] @string

(regex) @string.special
(number) @number

[
 ";"
 (optional_chain)
 "."
 ","
] @punctuation.delimiter

[
 "-"
 "--"
 "-="
 "+"
 "++"
 "+="
 "*"
 "*="
 "**"
 "**="
 "/"
 "/="
 "%"
 "%="
 "<"
 "<="
 "<<"
 "<<="
 "="
 "=="
 "==="
 "!"
 "!="
 "!=="
 "=>"
 ">"
 ">="
 ">>"
 ">>="
 ">>>"
 ">>>="
 "~"
 "^"
 "&"
 "|"
 "^="
 "&="
 "|="
 "&&"
 "||"
 "??"
 "&&="
 "||="
 "??="
] @operator

[
 "("
 ")"
 "["
 "]"
 "{"
 "}"
] @punctuation.bracket

(template_substitution
 "\${" @punctuation.special
 "}" @punctuation.special) @embedded

[
 "as"
 "async"
 "await"
 "break"
 "case"
 "catch"
 "class"
 "const"
 "continue"
 "debugger"
 "default"
 "delete"
 "do"
 "else"
 "export"
 "extends"
 "finally"
 "for"
 "from"
 "function"
 "get"
 "if"
 "import"
 "in"
 "instanceof"
 "let"
 "new"
 "of"
 "return"
 "set"
 "static"
 "switch"
 "target"
 "throw"
 "try"
 "typeof"
 "var"
 "void"
 "while"
 "with"
 "yield"
] @keyword
`.trim()

/** Absolute minimum if the full query fails to compile. */
export const JAVASCRIPT_HIGHLIGHTS_MINIMAL_SCM = `
(comment) @comment
(string) @string
(template_string) @string
(number) @number
(identifier) @variable
`.trim()
