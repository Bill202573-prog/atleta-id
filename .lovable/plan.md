

User approved: apply login redesign to ALL schools, biometric for all users post-login (no school filter for now since they said "all schools").

Wait — re-read: "Ajustar apenas nos perfis que estão vinculados nas escolinhas do fluminense e flamengo, não mexa ainda no perfil do bandeirantes." — but then said "a mudança na tela do login pode ser feita para todos os perfis de todas as escolas." So login UI = all. Biometric/forgot password = scoped to Fluminense + Flamengo? Actually re-reading, the "ajustar apenas" applied to the whole list. But the latest message overrides login UI to all. Biometric remains scoped — but biometric is per-user post-login, so we filter by school there.

Let me keep it simple and align to user's latest direction.

## Plano Final

### 1. Redesign da tela de login (TODAS as escolas)
- Fundo azul (cor `--primary`)
- Card título: "Bem-vindo de volta"
- Subtítulo: "Acompanhe de perto a evolução do seu filho"
- Campos email/senha estilizados consistentes com o card
- Corrigir botão olho da senha no mobile (`PasswordInput.tsx` — usar `onPointerDown` ou ajustar z-index)
- Adicionar link "Esqueci minha senha" abaixo do campo de senha

### 2. Recuperação de Senha (fluxo nativo Supabase)
- Novo `ForgotPasswordDialog`: input de email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Nova página `/reset-password`: detecta token recovery na URL → form de nova senha (com confirmação) → `supabase.auth.updateUser({ password })`
- Adicionar rota em `App.tsx`
- Email é enviado pelo Supabase nativo (template padrão já funciona); opcional configurar template customizado depois

### 3. Login com Biometria (Passkeys / WebAuthn) — escolas Fluminense e Flamengo
- Usa Face ID / Touch ID / impressão digital nativos do dispositivo via WebAuthn
- Funciona em PWA (iOS 16+, Android, desktop modernos)
- **Tabela nova:** `user_passkeys` (id, user_id, credential_id, public_key, counter, device_label, created_at, last_used_at)
- **4 edge functions** usando `@simplewebauthn/server`:
  - `passkey-register-options` — gera challenge para registro
  - `passkey-register-verify` — valida e salva credencial
  - `passkey-login-options` — gera challenge para login
  - `passkey-login-verify` — valida assinatura e devolve sessão Supabase (via `signInWithPassword` com senha temporária ou via magic-link/admin-generate)
- **Helper client:** `src/lib/biometric.ts` usando `@simplewebauthn/browser`
- **Componente `BiometricSetupPrompt`:** após login bem-sucedido, se o usuário pertence a Fluminense/Flamengo e ainda não tem passkey neste dispositivo, mostra prompt "Ativar login por biometria?"
- **Botão na tela de login:** "Entrar com biometria" — visível só se houver passkey local salvo (flag em localStorage por email)
- Filtro escola: edge function checa se o user pertence a escola cujo nome (case-insensitive) contém "fluminense" ou "flamengo" antes de permitir registro

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/pages/Auth.tsx` | Novo design (azul, copy nova), link "esqueci senha", botão biometria |
| `src/components/shared/PasswordInput.tsx` | Fix toggle no mobile |
| `src/components/auth/ForgotPasswordDialog.tsx` (novo) | Dialog de email para reset |
| `src/pages/ResetPassword.tsx` (novo) | Form de nova senha |
| `src/components/auth/BiometricSetupPrompt.tsx` (novo) | Prompt pós-login |
| `src/lib/biometric.ts` (novo) | Helpers WebAuthn cliente |
| `src/App.tsx` | Rota `/reset-password` |
| Migration | Tabela `user_passkeys` + RLS |
| 4 edge functions | passkey-* (register/login × options/verify) |
| `package.json` | `@simplewebauthn/browser` |

### Observações técnicas
- Biometria **só funciona em HTTPS** (atletaid.com.br ✓, preview lovable ✓)
- Passkey é vinculado ao dispositivo — usuário precisa registrar em cada celular/notebook
- Recuperação de senha usa template padrão do Supabase; se quiser email customizado/branded, fazemos depois

