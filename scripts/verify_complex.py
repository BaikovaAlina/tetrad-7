#!/usr/bin/env python3
"""Независимый SymPy-аудит ТОЛЬКО доверенного авторского комплексного банка.
Не принимает пользовательские выражения, не является веб-обработчиком.
Модели сверяются независимо от browser checker; полноту доказательств проверяет учитель.
"""
import json
from pathlib import Path
import re
import subprocess
import sys
try:
    import sympy as sp
    from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor
except ImportError:
    sys.exit('Установите SymPy: python -m pip install sympy')
ROOT = Path(__file__).resolve().parent.parent
code = "import {lessons} from './site/assets/js/curriculum.js';import {getBank} from './site/assets/js/bank.js';process.stdout.write(JSON.stringify(lessons.filter(l=>l.challenge).flatMap(l=>getBank(l.id))));"
items = json.loads(subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
SYMBOLS = {c: sp.Symbol(c, real=True) for c in 'abcdefghijklmnopqrstuvwxyz'}
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)

def expr(text, evaluate=True):
    s = str(text).replace('−', '-').replace('·', '*')
    s = re.sub('[⁰¹²³⁴⁵⁶⁷⁸⁹]+', lambda m: '^' + ''.join(str('⁰¹²³⁴⁵⁶⁷⁸⁹'.index(c)) for c in m[0]), s)
    if not re.fullmatch(r'[a-z0-9+*/^().\s-]+', s):
        raise ValueError('Недопустимый символ в доверенной модели')
    return parse_expr(s, local_dict={**SYMBOLS, 'abs': sp.Abs, 'floor': sp.floor}, transformations=TRANSFORMS, evaluate=evaluate)

def equation(text):
    left, right = text.split('=')
    return expr(left) - expr(right)

def numbers(q):
    return [expr(s.strip()) for s in q['answer'].strip('()').split(';')]

def equal_list(actual, expected):
    if len(actual) != len(expected) or any(sp.simplify(a-b) != 0 for a,b in zip(actual, expected)):
        raise ValueError(f'Ожидалось {expected}; в банке {actual}')

counts = {}; errors = []; proved_feasible = 0
for q in items:
    a = q['audit']; kind = a['kind']
    try:
        if kind == 'identity':
            if sp.cancel(expr(a['source']) - expr(q['answer'])) != 0:
                raise ValueError('Факторизация не тождественна исходному выражению')
        elif kind == 'roots':
            x = SYMBOLS[a['variable']]
            roots = sp.solve(equation(a['equation']), x)
            if set(numbers(q)) != set(roots):
                raise ValueError(f'Полный набор корней {roots} не совпал с {numbers(q)}')
            if a['single'] and len(roots) != 1:
                raise ValueError('Заявлен единственный корень, но модель даёт иной результат')
        elif kind == 'domain-report':
            x = SYMBOLS['x']; original = expr(a['source'], evaluate=False)
            forbidden = set()
            # Каждое деление сохраняется в AST до сокращения. Нули числителя
            # дроби-делителя также становятся запрещёнными значениями.
            for node in sp.preorder_traversal(original):
                if isinstance(node, sp.Pow) and node.exp.is_number and node.exp < 0:
                    numerator = sp.fraction(sp.together(node.base))[0]
                    if numerator.has(x):
                        forbidden.update(sp.solve(numerator, x))
            value = sp.cancel(original).subs(x, a['at'])
            equal_list(numbers(q), [value, *sorted(forbidden, key=float)])
        elif kind == 'parameter':
            parameter = SYMBOLS['a']; coefficient = expr(a['coefficient']); right = expr(a['constant'])
            critical = sp.solve(coefficient, parameter)
            infinite = [v for v in critical if sp.simplify(right.subs(parameter,v)) == 0]
            impossible = [v for v in critical if sp.simplify(right.subs(parameter,v)) != 0]
            if len(infinite) != 1 or len(impossible) != 1:
                raise ValueError('Неверное число особых случаев параметра')
            ordinary = sp.cancel(right/coefficient).subs(parameter, a['at'])
            equal_list(numbers(q), [impossible[0], infinite[0], ordinary])
        elif kind == 'integer-report':
            pairs = []
            for x in range(1, a['total']//a['a']+1):
                remainder = a['total'] - a['a']*x
                if remainder > 0 and remainder % a['c'] == 0:
                    pairs.append((x, remainder//a['c']))
            values = [p[0 if a['target']=='x' else 1] for p in pairs]
            equal_list(numbers(q), [len(pairs), min(values), max(values)])
        elif kind == 'system-report':
            variables = [SYMBOLS[c] for c in a['variables']]
            solutions = sp.solve([equation(e) for e in a['equations']], variables, dict=True)
            if len(solutions) != 1 or any(v not in solutions[0] for v in variables):
                raise ValueError('Модель не имеет единственного полного решения')
            solution = solutions[0]
            expected = [sp.simplify(expr(t).subs(solution)) for t in a['targets']]
            if a.get('phase'):
                phase = a['phase']; t = SYMBOLS[phase['variable']]
                roots = sp.solve(equation(phase['equation']).subs(solution), t)
                expected += sorted(set(roots), key=float)
            equal_list(numbers(q), expected)
            for e in a['equations']:
                if sp.simplify(equation(e).subs(solution)) != 0:
                    raise ValueError('Невязка в исходном уравнении модели')
            if a.get('rightTriangle'):
                h, c, d = [sp.simplify(expr(v).subs(solution)) for v in a['rightTriangle']]
                if not all(v > 0 for v in (h,c,d)) or sp.simplify(h*h-c*c-d*d) != 0:
                    raise ValueError('Несуществующая конфигурация длин прямоугольного треугольника')
                proved_feasible += 1
        elif kind == 'triangle-integers':
            if a.get('sides'):
                x,y = a['sides']
                bases = [z for z in range(1,x+y+1) if abs(x-y)<z<x+y and (x+y+z)%2==a['parity']]
            else:
                p=a['perimeter']
                bases = sorted(p-2*s for s in range(1,p) if p-2*s>0 and p-2*s<2*s)
            equal_list(numbers(q), [len(bases), min(bases), max(bases)])
        elif kind == 'proof':
            # Это структурный контроль, НЕ независимая сертификация доказательства.
            if len(q['steps']) < 5 or len(q['solutionSteps']) < 5:
                raise ValueError('Для составного доказательства недостаточно шагов')
        else:
            raise ValueError('Неизвестный вид независимого аудита')
        counts[kind] = counts.get(kind,0) + 1
    except Exception as exc:
        errors.append(f"{q['id']}: {exc}")
report = {'complex_tasks': len(items), 'mathematical_models_passed': sum(v for k,v in counts.items() if k!='proof'), 'proof_structures_only': counts.get('proof',0), 'geometric_length_configurations_verified': proved_feasible, 'kinds': counts, 'errors':len(errors)}
print(json.dumps(report,ensure_ascii=False,indent=2))
if errors:
    print('\n'.join(errors[:40]),file=sys.stderr)
    sys.exit(1)
