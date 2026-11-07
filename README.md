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

`tests/logistics_bl_nft.ts`:

- **Senaryo A**: `issue_bl` → `endorse` (düz SPL transfer) → `request_surrender` → `process_surrender` — sonunda durum `Redeemed`.
- **Senaryo B**: `issue_bl` → `request_surrender` → deadline geçer → `refund_surrender_timeout` (carrier/shipper/buyer'la ilgisiz, rastgele bir hesap çağırır — permissionless'liği gerçekten test eder) → durum `Issued` → **tekrar `request_surrender`** (refund sonrası B/L'nin gerçekten yeniden ibraz edilebildiğini kanıtlar — vault'un kapatılmaması yüzünden bu kırıktı, düzeltildi).
- **Negatif testler**: ilgisiz bir cüzdan `process_surrender` çağırırsa `has_one=carrier` ile patlar; deadline dolmadan `refund_surrender_timeout` çağrılırsa `DeadlineNotReached` ile patlar.

Carrier/shipper/buyer testte kasıtlı olarak 3 ayrı keypair; aynı cüzdanı birden fazla role vermek `has_one=carrier` gibi kontrolleri gerçek anlamda test etmez.

## Frontend (`panel/`)

```sh
cd panel
npm install
npm run dev
```

- `predev`/`prebuild` script'leri `target/idl`'den IDL'i otomatik kopyalar — program değişirse önce kök dizinde `anchor build`, sonra `npm run dev` yeterli, elle kopyalamaya gerek yok.
- Cüzdan bağlantısı **Phantom'a doğrudan** (`window.phantom.solana`) — `@solana/wallet-adapter-*` paketleri kasıtlı olarak kullanılmadı. **Phantom'ın devnet'e ayarlı olması gerekiyor** (Phantom ayarları → Developer Settings → Testnet Mode, veya ağ seçiciden Devnet).
- Zincir katmanı (`src/chain.ts`) devnet'e sabit (`https://api.devnet.solana.com`), `VITE_RPC_URL` ortam değişkeniyle override edilebilir.

### Demo akışı (Carrier → Shipper → Buyer)

Panel sabit bir "rol"/login kavramı kullanmıyor — her sayfa, bağlı cüzdanın o spesifik B/L ile ilişkisini (carrier mi, token'ı tutan mı, vs.) canlı hesaplıyor. Tek bir tarayıcıda aynı anda sadece bir Phantom hesabı bağlı olabileceği için, 3 rolü göstermek üzere **Phantom'ın kendi hesap değiştiricisini** kullan:

1. Phantom'da Carrier için kullanacağın hesabı seç, bağlan, **Issue** sekmesinden bir B/L oluştur (shipper adresini gir) — oluşan mint adresini kopyala.
2. Phantom'da hesabı Shipper'a çevir (uygulama ayrıca bağlanmana gerek yok — `accountChanged` dinleniyor, panel otomatik güncellenir). **Track**'ten mint'i aç, "Endorse" formuyla Buyer'ın adresine devret.
3. Phantom'da hesabı Buyer'a çevir, aynı mint'i tekrar aç, "Request surrender" ile ibraz et.
4. Phantom'da hesabı Carrier'a geri çevir, "Process surrender" ile redeem et (ya da deadline'ı bekleyip herhangi bir hesapla "Claim timeout refund" dene — permissionless).

Panel her adımda bağlı cüzdanın o B/L için **kapasitesini** ("Carrier'sın", "Bu B/L şu an sende", vb.) açıkça gösterir — hangi hesapla hangi aksiyonu yapabileceğin karışmasın diye.
