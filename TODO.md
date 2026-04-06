# MikroTik Success Page Enhancement - TODO

## Status: [0/4] In Progress

### 1. [ ] Create TODO.md (Current)
### 2. [✅] Edit src/pages/Portal.tsx
   - Add `username` to `getParams()`
   - Add state `dataUsed: { upMb: number; downMb: number } | null`
   - In `connectUser()`: Query session data from `sessions` + aggregate `radacct` for data usage using `username`/`mac`
   - Update success step UI to display data used (up/down arrows, MB/GB auto-switch)
### 3. [✅] Test locally
   - `bun run dev`
   - Simulate params: `?link-login-only=http://wifi.local/login&username=testuser&mac=AA:BB:CC:DD:EE:FF&ip=192.168.1.100`
   - Verify data usage display
### 4. [✅] Complete & cleanup
   - Update TODO.md ✅
   - `attempt_completion` ✅
