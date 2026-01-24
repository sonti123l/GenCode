from tree_sitter import Language, Parser

# Build languages (you'll need to clone grammars first)
# Language.build_library(
#     'build/my-languages.so',
#     [
#         'vendor/tree-sitter-python',
#         'vendor/tree-sitter-javascript',
#     ]
# )

# Load languages
PYTHON = Language('build/my-languages.so', 'python')
JAVASCRIPT = Language('build/my-languages.so', 'javascript')

# Create parser
parser = Parser()
parser.set_language(PYTHON)

# Parse code
source_code = """
def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)
"""

tree = parser.parse(bytes(source_code, "utf8"))
print(tree.root_node)

# Query example
query = PYTHON.query("""
    (function_definition name: (identifier) @function-name)
""")

captures = query.captures(tree.root_node)
for node, capture_name in captures:
    print(f"Found function: {node.text.decode('utf8')}")