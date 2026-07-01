def evaluate(expr):
    """Evaluate an arithmetic expression string and return a float.

    Supports: + - * / , parentheses, unary minus/plus, integer and decimal
    literals, and arbitrary whitespace. Standard precedence (* and / bind tighter
    than + and -), left-associative. Raise ValueError on ANY malformed input:
    empty/blank, bad characters, unbalanced parentheses, two adjacent numbers,
    a dangling or leading binary operator, or division by zero.

    Implement the parser yourself. Do not use eval/exec/ast.literal_eval or any
    expression-evaluation library.
    """
    raise NotImplementedError
