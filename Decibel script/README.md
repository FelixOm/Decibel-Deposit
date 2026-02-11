# Decibel Deposit

Скрипт для депозита USDC в Decibel (субаккаунт / пул pre-deposits).  
Официального **Python SDK у Decibel нет** — только TypeScript, поэтому скрипт на **TypeScript**.

- Pre-deposits: [https://app.decibel.trade/pre-deposits](https://app.decibel.trade/pre-deposits)
- API-кошельки: [https://app.decibel.trade/api](https://app.decibel.trade/api)
- Документация: [TypeScript SDK](https://docs.decibel.trade/typescript-sdk/overview), [Transactions](https://docs.decibel.trade/transactions/overview)

## Что делает скрипт

1. Для каждого ключа из `PRIVATE_KEYS`: получает список субаккаунтов через Decibel REST API.
2. Если субаккаунта нет — создаёт его транзакцией `create_new_subaccount`.
3. Отправляет депозит USDC в субаккаунт транзакцией `deposit_to_subaccount_at`.

Ограничения по кампании: минимум 50 USDC, максимум 1 000 000 USDC на кошелёк.

## Solana CCTP (без Aptos-токенов, только SOL)

Депозит через **Circle CCTP**: сжигаем USDC на Solana, минтим на Aptos (domain 9). Нужны только SOL на газ и USDC на Solana.  
Пример транзакции: [Solscan](https://solscan.io/tx/2RNRjzG4L3qAZDNdJ3bsN8FnREEP7iziwyqoD19pqRiNxERuahSMrN8NZ57rEAzTNynLy3eDwk59YSPz4mYU43pN).

**Две подписи (burn + create account):** в UI Decibel при ручном депозите кошелёк просит подписать две безгазовые операции — burn и create account. В нашем скрипте это одна транзакция с двумя подписантами: твой кошелёк (owner) и одноразовый ключ для аккаунта события CCTP (`message_sent_event_data`). Обе подписи отправляются в одной транзакции, поэтому средства не остаются «на полпути».

В `.env` задать:
- `SOLANA_PRIVATE_KEY` — секрет ключа Solana (base58 или JSON-массив)
- `APTOS_RECIPIENT_ADDRESS` — Aptos-адрес (0x + 64 hex), куда получить USDC

Запуск:
```bash
npm run deposit-solana
```

### Если средства застряли (Solana → Aptos)

1. **Проверить, что burn на Solana прошёл:** твоя tx в [Solscan](https://solscan.io) в статусе Success, есть событие `DepositForBurn`.
2. **Attestation (CCTP):** Circle подписывает сообщение обычно за 10–20 мин. Проверка: [CCTP Messages API](https://developers.circle.com/developer/docs/cctp-get-messages) — по `sourceTxHash` (signature твоей Solana tx) или по домену/nonce.
3. **Получение на Aptos:** после attestation кто-то должен вызвать `receiveMessage` на Aptos (часто это делает релей/интегратор Decibel). Если в UI Decibel перевод «висит» на шаге «Receiving on Aptos» — обычно достаточно подождать или обновить страницу; бэкенд Decibel дотягивает сообщение сам.
4. **Если долго не приходят:** написать в поддержку Decibel (Discord/Telegram) и указать: Solana tx signature (Solscan), Aptos-адрес получателя, сумму. Они могут вручную проверить attestation и при необходимости «протолкнуть» receive на своей стороне.
5. **Ручной receive на Aptos:** если Decibel выложили контракт/инструкцию для вызова receive вручную — можно вызвать самому (нужен APT на газ). Документацию CCTP для Aptos смотри на [Circle CCTP Aptos](https://developers.circle.com/cctp/v1/aptos-packages).

## Установка

```bash
npm install
cp .env.example .env
# заполнить .env
```

## Переменные окружения (.env)

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `PRIVATE_KEYS` | да | Приватные ключи Aptos (Ed25519, hex), через запятую |
| `APTOS_NODE_API_KEY` | да | Client API key с [Geomi](https://geomi.dev) для Decibel GET API |
| `DEPOSIT_USDC` | нет | Сумма в USDC на кошелёк (по умолчанию 50) |
| `DECIBEL_TESTNET` | нет | `true` — Testnet, иначе Netna |
| `DECIBEL_USDC_METADATA` | нет | Адрес USDC metadata на Aptos (если не из конфига SDK) |

## Запуск

```bash
npm run deposit
# или
npx tsx src/deposit.ts
```

## Важно

- Нужен APT на кошельке для газа (или [Geomi Gas Station](https://docs.decibel.trade/quickstart/gas-station)).
- API Wallet создаётся вручную на [app.decibel.trade/api](https://app.decibel.trade/api).
