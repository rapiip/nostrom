# Deploy Nostrom via Remix + MetaMask

Panduan deploy **`contracts/NostromFactory.sol`** ke BOT Chain Testnet lewat Remix.
Semua langkah manual, Anda yang pegang kendali — tidak ada yang dipublikasikan otomatis.

---

## Pahami dulu: Anda deploy Factory, bukan Vault

Ini kunci arsitektur multi-tenant. Ada dua level:

```
  ANDA (sekali saja, sebagai penyedia platform)
       │
       └── deploy NostromFactory  ──────────────┐
                                               │
  SETIAP USER (lewat frontend Anda nanti)      │
       │                                       │
       ├── user A: factory.createVault(...) ──> Vault A  (owner: user A)
       ├── user B: factory.createVault(...) ──> Vault B  (owner: user B)
       └── user C: factory.createVault(...) ──> Vault C  (owner: user C)
```

Setiap user dapat **kontrak vault sendiri di alamat sendiri**, dengan agent dan
cold wallet milik mereka sendiri. Dana tiap user benar-benar terpisah di kontrak
masing-masing — bukan cuma dicatat terpisah, tapi fisik terpisah. Factory hanya
menyimpan daftar supaya frontend bisa menemukan dan menampilkannya.

**Yang Anda deploy cuma Factory, satu kali.** Setelah itu Anda tidak perlu
deploy apa pun lagi — user yang bikin vault mereka sendiri.

Factory-nya **tidak punya owner, tidak punya admin, tidak ada fee, tidak bisa
di-upgrade**. Jadi tidak ada yang bisa Anda (atau siapa pun) salahgunakan dari
dana user. Ini penting supaya orang lain mau memakai platform Anda.

---

## Phase 1 — Wallet

Install MetaMask dari metamask.io, buat wallet baru, **catat 12 Secret Recovery
Phrase di kertas**. Jangan simpan digital, jangan share ke siapa pun.

---

## Phase 2 — Tambah BOT Chain Testnet

MetaMask → dropdown network (kiri atas) → **Add a network** →
**Add a network manually**:

| Field | Value |
|---|---|
| Network Name | BOT Chain Testnet |
| New RPC URL | `https://rpc.bohr.life` |
| Chain ID | `968` |
| Currency Symbol | BOT |
| Block Explorer URL | `https://scan.bohr.life/` |

**Save** → pastikan network aktif berpindah ke BOT Chain Testnet.

---

## Phase 3 — Ambil BOT testnet dari faucet

1. Copy alamat wallet dari MetaMask.
2. Buka faucet testnet resmi (link ada di dev docs Botchain).
3. Paste alamat → minta test BOT → tunggu 1–2 menit → cek saldo.

Deploy factory butuh sekitar **3.100.000 gas**, jadi pastikan saldo cukup.
Kalau faucet memberi sedikit, minta beberapa kali atau tunggu cooldown.

---

## Phase 4 — Compile di Remix

1. Buka **remix.ethereum.org**.
2. File Explorer → klik **"+"** → nama file: `NostromFactory.sol`.
3. Buka `contracts/NostromFactory.sol` di komputer Anda → copy **seluruh isi** →
   paste ke Remix.
   - File ini sudah berisi semuanya (library Clones, NostromVault, NostromFactory)
     tanpa import eksternal, jadi copy-paste langsung jalan.
4. Klik ikon **Solidity Compiler** (`<S>`).
5. Compiler version: **0.8.24** (harus cocok dengan `pragma solidity 0.8.24;`).
6. Buka **Advanced Configurations**:
   - **EVM Version**: `paris`
   - **Enable optimization**: dicentang, runs `200`
7. Klik **Compile NostromFactory.sol** → tunggu centang hijau.

> Kalau muncul warning (bukan error) soal ukuran kontrak, itu normal — factory
> menyertakan bytecode vault di dalamnya.

---

## Phase 5 — Deploy Factory

1. Klik ikon **Deploy & Run Transactions**.
2. **Environment** → **Injected Provider - MetaMask** → Connect.
3. Pastikan MetaMask masih di **BOT Chain Testnet (968)**.
4. **CONTRACT** → pilih **`NostromFactory`**.

   Di dropdown akan ada beberapa pilihan (`Clones`, `IERC20`, `NostromVault`,
   `NostromFactory`). **Pilih `NostromFactory`.** Jangan pilih yang lain:
   - `Clones` / `IERC20` — library & interface, tidak bisa dipakai sendiri
   - `NostromVault` — logika vault; factory sudah otomatis men-deploy ini
     sendiri di dalam constructor-nya, Anda tidak perlu deploy manual

5. **Tidak ada field input** — constructor `NostromFactory` tanpa parameter.
   Ini berbeda dari versi single-tenant sebelumnya.
6. Klik **Deploy** oranye → MetaMask popup → **Confirm**.
7. Alamat factory muncul di **Deployed Contracts**. **Simpan alamat ini** —
   nanti dipakai frontend Anda.

---

## Phase 6 — Verifikasi di Explorer

1. Copy alamat factory dari Remix.
2. Buka **scan.bohr.life** → paste di search bar.
3. Cek transaksi deploy Anda muncul.

---

## Phase 7 — Tes bikin vault lewat Remix

Sebelum bikin frontend, pastikan factory bekerja. Di panel Deployed Contracts,
expand `NOSTROMFACTORY`:

### 1. Cek implementation sudah ter-deploy

Klik **`implementation`** (tombol biru). Harus keluar alamat, bukan
`0x0000...0000`.

### 2. Buat vault pertama

Untuk tes, siapkan **dua akun berbeda** di MetaMask (Add account) sebagai
agent dan recovery. Lalu expand **`createVault`** dan isi:

| Field | Isi | Contoh |
|---|---|---|
| `_agentAddress` | alamat wallet agen AI | `0xAgent...` |
| `_recoveryAddress` | cold wallet, **harus beda dari agent** | `0xCold...` |
| `_timeoutPeriod` | detik, min `30` maks `31536000` | `60` (untuk tes cepat) |

Klik **transact** → Confirm di MetaMask.

### 3. Temukan alamat vault Anda

Klik **`vaultsOf`**, masukkan alamat wallet Anda → keluar array berisi alamat
vault. Atau cek transaksi di explorer, lihat event `VaultCreated`.

Bisa juga klik **`totalVaults`** untuk memastikan jumlahnya bertambah.

### 4. Cek isi vault

Klik **`getVaultSnapshot`**, masukkan alamat vault → keluar semua state-nya
sekaligus (owner, agent, recovery, saldo, deadline, dll). Ini fungsi yang nanti
dipakai frontend untuk menampilkan dashboard.

### 5. Kirim dana ke vault

Kirim BOT dari MetaMask langsung ke alamat vault (bukan ke factory). Lalu cek
`getVaultSnapshot` lagi — `balance` harus bertambah.

### 6. Tes dead-man's switch

Kalau `_timeoutPeriod` diisi `60`, tunggu 60+ detik tanpa `ping()`, lalu:

- Klik **`getExecutableVaults`** dengan `_offset = 0`, `_limit = 100` → vault
  Anda harus muncul di daftar.
- Untuk mengeksekusi: di Remix, buka file baru → pilih `NostromVault` di dropdown
  CONTRACT → gunakan **"At Address"** (kotak di bawah tombol Deploy), paste
  alamat vault → klik **At Address**. Vault muncul sebagai kontrak terpisah →
  klik **`executeDeadManSwitch`**.
- Dana harus pindah ke `recoveryAddress`.

> Kalau `executeDeadManSwitch` gagal dengan `AgentStillAlive`, berarti belum
> lewat timeout. Cek `timeUntilTrigger` untuk lihat sisa detiknya.

---

## Untuk frontend nanti

Fungsi factory yang akan Anda pakai:

| Fungsi | Untuk apa |
|---|---|
| `createVault(agent, recovery, timeout)` | user bikin vault |
| `createVaultAndFund(...)` payable | bikin + isi dana, satu tanda tangan |
| `createVaultDeterministic(..., salt)` | alamat vault bisa ditampilkan sebelum tx dikirim |
| `predictVaultAddress(creator, salt)` | hitung alamat di muka |
| `vaultsOf(user)` | daftar vault milik user |
| `getVaultsSnapshot(address[])` | **baca banyak vault dalam 1 panggilan RPC** |
| `getExecutableVaults(offset, limit)` | untuk keeper bot |
| `isVault(address)` | **pakai ini untuk cegah user berinteraksi dengan kontrak palsu** |
| `totalVaults()`, `getVaults(offset, limit)` | eksplorasi global |

Event `VaultCreated` bisa diindeks (The Graph didukung Botchain) untuk membangun
daftar tanpa polling.

**Catatan penting untuk frontend:** registry `vaultsOf` mencatat **pembuat**
vault, dan itu tidak pernah berubah. Tapi owner vault bisa dipindah lewat
`transferOwnership`, dan agent/recovery bisa dirotasi. Jadi untuk menampilkan
kondisi terkini, baca dari vault-nya (`getVaultsSnapshot`), jangan mengandalkan
registry saja.

---

## Biaya gas (hasil pengukuran)

| Operasi | Gas | Siapa yang bayar |
|---|---|---|
| Deploy `NostromFactory` | ~3.071.000 | Anda, sekali saja |
| `createVault` | ~343.000 | user, tiap bikin vault |
| `createVaultAndFund` | ~338.000 | user |
| `ping()` | ~37.600 | agen AI, tiap heartbeat |
| `deposit()` | ~25.700 | user |
| `executeDeadManSwitch()` | ~74.400 | keeper siapa pun |

Sebagai perbandingan, kalau tiap user harus deploy vault penuh sendiri biayanya
~1.723.000 gas. Pola clone menghemat **80%** per user.

---

## Catatan keamanan

- Kontrak ini **belum diaudit**. Uji di testnet sampai yakin.
- **`ping()` butuh gas.** Wallet agent harus punya saldo BOT, kalau habis maka
  heartbeat gagal dan switch akan aktif walaupun agennya sehat. Monitor saldo ini.
- `agentAddress` sengaja **tidak punya akses ke dana** — cuma bisa `ping()`.
  Kalau key agent bocor, penyerang cuma bisa menjaga vault tetap "hidup".
- Vault owner dipercaya penuh atas vault-nya sendiri: bisa withdraw kapan saja
  dan ubah recovery address. Nostrom melindungi dari **agen yang mati**, bukan
  dari owner yang jahat.
- Simpan private key recovery/cold wallet **terpisah dan lebih aman** dari key
  agent maupun owner.
- Vault adalah EIP-1167 proxy. Kontrak lain yang mengirim BOT pakai
  `transfer()`/`send()` (stipend 2300 gas) akan **gagal** — pakai `deposit()`
  atau `call` dengan gas cukup. Kirim dari wallet biasa tidak masalah.

---

## Kalau Remix error "Failed to fetch eth_chainId"

Itu masalah koneksi browser ke RPC, bukan kontraknya. RPC `rpc.bohr.life` sudah
saya tes responsif. Coba:

1. MetaMask → titik tiga → **Connected sites** → disconnect `remix.ethereum.org`,
   lalu connect ulang dari Remix.
2. Cek ulang RPC URL di setting network MetaMask (tidak ada spasi/typo).
3. Reload halaman Remix (F5) setelah network sudah aktif.
4. Kalau masih gagal, buka Console browser (F12) untuk pesan error yang lebih detail.
