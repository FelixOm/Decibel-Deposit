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

В `.env` задать:
- `SOLANA_PRIVATE_KEY` — секрет ключа Solana (base58 или JSON-массив)
- `APTOS_RECIPIENT_ADDRESS` — Aptos-адрес (0x + 64 hex), куда получить USDC

Запуск:
```bash
npm run deposit-solana
```

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
