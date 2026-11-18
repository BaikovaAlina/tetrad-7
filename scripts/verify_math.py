#!/usr/bin/env python3
"""Дополнительная НЕЗАВИСИМАЯ проверка авторского банка через SymPy.
Установка для разработчика: python -m pip install sympy
Не запускается в браузере, не принимает ответы ученика, не входит в runtime.
SymPy получает только доверенные строки генераторов проекта, а не внешний ввод.
Канонический самотест checker дополнен восстановлением выражения из УСЛОВИЯ.
"""
from fractions import Fraction
from pathlib import Path
import json
import re
import subprocess
import sys
import html

try:
    import sympy as sp
    from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor
except ImportError:
    sys.exit('Для расширенной проверки установите SymPy: python -m pip install sympy')
ROOT=Path(__file__).resolve().parent.parent
code="import {lessons} from './site/assets/js/curriculum.js';import {getBank} from './site/assets/js/bank.js';process.stdout.write(JSON.stringify(lessons.flatMap(l=>getBank(l.id))));"
result=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,capture_output=True,text=True,check=True)
items=json.loads(result.stdout)
letters={c:sp.Symbol(c, real=True) for c in 'abcdefghijklmnopqrstuvwxyz'}
transformations=standard_transformations+(implicit_multiplication_application,convert_xor)

def expression(text):
    text=html.unescape(str(text)).replace('−','-').replace('–','-').replace('·','*').replace('×','*')
    text=re.sub('[⁰¹²³⁴⁵⁶⁷⁸⁹]+',lambda m:'^'+''.join(str('⁰¹²³⁴⁵⁶⁷⁸⁹'.index(c)) for c in m[0]),text)
    text=re.sub(r'(\d),(?=\d)',r'\1.',text)
    text=re.sub(r'\|([^|]+)\|',lambda m:str(abs(expression(m[1]))),text)
    text=re.sub(r'(?<=\d)(?=[a-z])','*',text)
    if ':' in text:
        left,right=text.split(':',1);text=f'({left})/({right})'
    if not re.fullmatch(r'[a-z0-9+*/^().\s-]+',text):
        raise ValueError('Внутренняя формула содержит неожиданные символы')
    return parse_expr(text,local_dict=letters,transformations=transformations)

errors=[];symbolic=numeric=equations=invariants=0
for q in items:
    id=q['id'];lesson=q['lessonId'];b=q['index']%3;n=q['index']//3+2
    spans=re.findall(r'<span class="math">(.*?)</span>',q['prompt'])
    plain=html.unescape(re.sub(r'<[^>]+>','',q['prompt']))
    try:
        if q['type']=='expression':
            if spans:
                source=expression(spans[0])
            elif lesson=='a09':
                ns=[int(v) for v in re.findall(r'\d+',plain)]
                source=ns[0]*letters['x']+ns[1] if b==0 else ns[0]*letters['t'] if b==1 else 2*letters['x']+ns[0]
            elif lesson=='a23' and b==1:
                source=int(re.findall(r'\d+',plain)[0])*letters['x']
            else:
                raise ValueError('Нужно добавить независимый разбор нового вида условия')
            if sp.cancel(source-expression(q['answer']))!=0:
                raise ValueError('Ответ не равен выражению, восстановленному из условия')
            symbolic+=1
        elif q['type'] in ('number','fraction') and spans and re.match(r'(Вычисли:|Найди значение:)',plain) and not re.search('[a-zA-Z=<>%]',spans[0]):
            source=expression(spans[0])
            # В заданиях «число % от …» отдельно заданные операнды не являются всем условием.
            if re.match(r'(Вычисли:|Найди значение:)',plain):
                if sp.cancel(source-expression(q['answer']))!=0:raise ValueError('Числовое выражение посчитано неверно')
                numeric+=1
        if lesson in ('a11','a13'):
            left,right=spans[0].split('=');solutions=sp.solve(sp.Eq(expression(left),expression(right)),letters['x'])
            if solutions!=[expression(q['answer'])]:raise ValueError('Корень не совпал с независимым решением уравнения')
            equations+=1
        formulas={
            'g01':[3*n+4,n+3,3*n+5],
            'g02':[n+25,2*n+55,None],
            'g03':[85-n,3*n+15,Fraction(180,n+1)],
            'g04':[70-n,n+3,80-n],
            'g05':[4*n+8,4*n+8,3*(n+4)],
            'g07':[n+4,90,3*n+15],
            'g11':[75-n,110-2*n,n+7],
            'g12':[n+20,2*n+10,90],
            'g13':[n+20,110-n,None],
            'g14':[n+40,80-n,n+10],
            'g15':[110-2*n,Fraction(180,n+3),70-2*n],
            'g16':[75,2*n+70,60-n],
            'g19':[70-n,Fraction(90,n+1),None],
            'g20':[n+5,2*n+6,30],
            'g21':[n+6,2*n+10,n+7],
            'g24':[2*n+8,n+7,n+3],
            'g25':[2,90,0],
            'g33':[10,Fraction(n,2),None],
            'g34':[180*n,Fraction(360,n+2),n+2],
            's02':[n+3,n+9,n+4],
            's03':[n+4,n+4,2*n+5],
            's11':[3,Fraction(n+3,3*n+6),3*n+3],
        }
        if lesson in formulas and formulas[lesson][b] is not None:
            if Fraction(q['answer'])!=formulas[lesson][b]:raise ValueError('Не совпал независимый геометрический/статистический эталон')
            invariants+=1
    except Exception as exc:
        errors.append(f'{id}: {exc}')
summary={'symbolic_from_prompts':symbolic,'numeric_from_prompts':numeric,'linear_equations':equations,'independent_geometry_statistics':invariants,'errors':len(errors)}
print(json.dumps(summary,ensure_ascii=False,indent=2))
if errors:
    print('\n'.join(errors[:30]),file=sys.stderr);sys.exit(1)
