# Logistics-bl-nft

Bill of lading'i (konşimento) Solana üzerinde SPL NFT olarak modelleyen bir Anchor programı — devir (endorsement) = NFT transferi, ibraz (surrender) = vault'a kilitleme + yetkili yakma. MLH Solana hackathonu için geliştirildi.

Mimari detayları için `docs/mimari-spec.md`.

## Çalıştırma

```sh
anchor build
anchor test --validator legacy
```

**`--validator legacy` şart.** Bu Anchor sürümü (1.2.2) varsayılan olarak `surfpool` adlı bir local validator arıyor; sistemde kurulu değilse düz `anchor test` şu hatayla patlar:

```
Error: Failed to spawn `surfpool`: No such file or directory (os error 2)
```

`--validator legacy` klasik `solana-test-validator`'ı kullanır, ek bir araç kurmaya gerek kalmaz.

## Devnet deploy

```
Program ID: Cv8LVQWVR6t59hPQfSyf9LmFsG9ueouz5iZKfiNJV7nN
```

https://explorer.solana.com/address/Cv8LVQWVR6t59hPQfSyf9LmFsG9ueouz5iZKfiNJV7nN?cluster=devnet

## Testler

`tests/logistics_bl_nft.ts`, iki senaryoyu uçtan uca doğrular:

- **Senaryo A**: `issue_bl` → `endorse` (düz SPL transfer) → `request_surrender` → `process_surrender` — sonunda durum `Redeemed`.
- **Senaryo B**: `issue_bl` → `request_surrender` → deadline geçer → `refund_surrender_timeout` (carrier/shipper/buyer'la ilgisiz, rastgele bir hesap çağırır — permissionless'liği gerçekten test eder) — sonunda durum `Issued`.

Carrier/shipper/buyer testte kasıtlı olarak 3 ayrı keypair; aynı cüzdanı birden fazla role vermek `has_one=carrier` gibi kontrolleri gerçek anlamda test etmez.
