#!/usr/bin/env python3
"""Локально получить chat_id СВОЕГО бота после /start.
Токен вводится скрыто через getpass, не сохраняется в файл и не печатается.
Используется только официальный HTTPS Bot API. Не запускается при сборке.
"""
import getpass
import json
import re
import sys
import urllib.error
import urllib.request

def main():
    print('Откройте личный чат со своим ботом, нажмите /start и отправьте любое сообщение.')
    if not sys.stdin.isatty():
        print('Нужен интерактивный локальный терминал для скрытого ввода. Токен не считывался.');return 1
    try:
        token=getpass.getpass('Новый токен бота (ввод скрыт): ').strip()
    except (EOFError,KeyboardInterrupt):
        print('\nВвод отменён.');return 1
    if not re.fullmatch(r'\d{5,20}:[A-Za-z0-9_-]{20,150}',token):
        print('Неверный формат токена. Ничего не отправлено.');return 1
    data=json.dumps({'timeout':0,'limit':50,'allowed_updates':['message']}).encode()
    req=urllib.request.Request('https://api.telegram.org/bot'+token+'/getUpdates',data=data,headers={'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            result=json.load(response)
    except urllib.error.HTTPError as exc:
        # Не печатаем исключение целиком: его URL содержит ключ.
        print(f'Bot API вернул HTTP {exc.code}. 401: неверный токен; 409: getUpdates занят webhook или другим приложением.')
        print('Для нового отдельного бота обычно достаточно /start. Не удаляйте webhook действующего чужого приложения.');return 1
    except Exception:
        print('Нет корректного ответа Bot API. Проверьте сеть и доступность Telegram; токен не сохранён.');return 1
    if result.get('ok') is not True:
        print('Telegram не подтвердил запрос. Проверьте токен и повторите локально.');return 1
    chats={}
    for update in result.get('result',[]):
        chat=update.get('message',{}).get('chat',{})
        if isinstance(chat.get('id'),int):chats[chat['id']]=chat
    if not chats:
        print('Сообщений пока нет. Нажмите /start именно у ЭТОГО бота, отправьте сообщение и запустите скрипт снова.')
        print('Если бот уже используется программой, она могла забрать обновления. Лучше создать отдельного учебного бота.');return 1
    print('\nНайдены чаты; выберите получателя результатов:')
    for id,chat in chats.items():
        name=chat.get('title') or chat.get('first_name') or 'Без названия'
        print(f'chat_id = {id} · {chat.get("type","unknown")} · {name}')
    print('\nВ GitHub Secret TELEGRAM_CHAT_ID нужен chat_id получателя, не ID бота и не @username.')
    print('Для Worker этот же chat_id хранится в серверном Secret. Ключи не добавляйте в git.')
    return 0

if __name__=='__main__':
    sys.exit(main())
