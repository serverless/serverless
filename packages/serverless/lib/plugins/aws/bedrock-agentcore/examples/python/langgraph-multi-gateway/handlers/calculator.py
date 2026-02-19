"""
Calculator Lambda function - exposed as a public Gateway tool.

This function evaluates mathematical expressions safely using AST parsing.
"""

import json
import math
import ast
import operator


OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

FUNCTIONS = {
    'sqrt': math.sqrt,
    'sin': math.sin,
    'cos': math.cos,
    'tan': math.tan,
    'log': math.log,
    'log10': math.log10,
    'abs': abs,
    'floor': math.floor,
    'ceil': math.ceil,
    'round': round,
    'pow': pow,
}

CONSTANTS = {
    'pi': math.pi,
    'e': math.e,
}


def handler(event, context):
    """Lambda handler for calculator tool."""
    print(f"Calculator invoked with event: {json.dumps(event)}")

    if isinstance(event, str):
        event = json.loads(event)

    if 'body' in event:
        body = event['body']
        if isinstance(body, str):
            body = json.loads(body)
        expression = body.get('expression', '')
    else:
        expression = event.get('expression', '')

    if not expression:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing expression parameter'})
        }

    try:
        result = safe_calculate(expression)
        return {
            'statusCode': 200,
            'body': json.dumps({'result': result, 'expression': expression})
        }
    except Exception as e:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(e), 'expression': expression})
        }


def safe_calculate(expression: str) -> float:
    """Safely evaluate a mathematical expression using AST parsing."""
    expression = expression.replace('^', '**')
    try:
        tree = ast.parse(expression, mode='eval')
        return _evaluate_node(tree.body)
    except SyntaxError:
        raise ValueError(f"Invalid expression syntax: {expression}")


def _evaluate_node(node):
    """Recursively evaluate an AST node."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError(f"Unsupported constant type: {type(node.value)}")

    if isinstance(node, ast.Num):
        return float(node.n)

    if isinstance(node, ast.BinOp):
        left = _evaluate_node(node.left)
        right = _evaluate_node(node.right)
        op_func = OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        return op_func(left, right)

    if isinstance(node, ast.UnaryOp):
        operand = _evaluate_node(node.operand)
        op_func = OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        return op_func(operand)

    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
            if func_name in FUNCTIONS:
                args = [_evaluate_node(arg) for arg in node.args]
                return FUNCTIONS[func_name](*args)
            raise ValueError(f"Unknown function: {func_name}")
        raise ValueError("Function calls must be simple names")

    if isinstance(node, ast.Name):
        name = node.id
        if name in CONSTANTS:
            return CONSTANTS[name]
        raise ValueError(f"Unknown variable: {name}")

    raise ValueError(f"Unsupported expression type: {type(node).__name__}")
