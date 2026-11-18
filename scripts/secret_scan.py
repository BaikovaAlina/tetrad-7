#!/usr/bin/env python3
"""Локальная эвристика против случайного коммита ключей. Не замена secret scanning GitHub.
Не печатает совпавшие значения — только путь и тип возможного секрета.
"""
from pathlib import Path
import re
import sys
ROOT = Path(__file__).resolve().parent.parent
SKIP = {'.git','node_modules','_public','test-results','playwright-report','__pycache__','.venv'}
TEXT = {'.js','.mjs','.json','.md','.yml','.yaml','.py','.html','.css','.toml','.txt','.example'}
PATTERNS = {
    'Telegram bot token': re.compile(r'(?<![A-Za-z0-9_])\d{6,20}:[A-Za-z0-9_-]{30,150}(?![A-Za-z0-9_-])'),
    'GitHub fine-grained PAT': re.compile(r'github_pat_[A-Za-z0-9_]{35,}'),
    'GitHub classic token': re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}
errors=[]
for path in ROOT.rglob('*'):
    if not path.is_file() or set(path.relative_to(ROOT).parts)&SKIP or path.suffix not in TEXT:
        continue
    try:
        text=path.read_text(encoding='utf-8')
    except (UnicodeError,OSError):
        continue
    for label, pattern in PATTERNS.items():
        if pattern.search(text):
            errors.append(f'{path.relative_to(ROOT)}: возможный {label}')
config=(ROOT/'site/config.js').read_text(encoding='utf-8')
for placeholder in ('__TELEGRAM_BOT_TOKEN__','__TELEGRAM_CHAT_ID__'):
    if placeholder not in config:
        errors.append('site/config.js: отсутствует обязательный плейсхолдер')
if errors:
    print('Проверка не пройдена. Не публикуйте ключи:\n'+'\n'.join(errors),file=sys.stderr)
    sys.exit(1)
print('Эвристическая проверка: похожих на реальные ключей в исходниках не найдено.')
