import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // Buffer/process polyfill'i ES module import sırasına güvenen elle bir satırla
  // (main.tsx'te denendi) yapmak işe yaramadı — bağımlılıklar (App→IssueBl→chain→
  // @solana/spl-token) importing modülün kendi gövde kodundan ÖNCE değerlendiriliyor,
  // konumdan bağımsız. Bu plugin her kullanım yerine build-time inject yapıyor,
  // sıralamaya bağımlı değil.
  plugins: [react(), nodePolyfills({ include: ['buffer'] })],
})
