
Objetivo: corrigir a renovação de sessão após o desbloqueio biométrico sem mexer no login atual por e-mail/senha.

Diagnóstico do estado atual
- A biometria já está como camada local e o ponto de falha real está em `src/lib/biometric.ts`, no trecho que chama `supabase.auth.refreshSession({ refresh_token })`.
- Pelo código, o risco mais provável hoje é uso de `refresh_token` desatualizado/rotacionado, combinado com pouca telemetria para saber se o erro é `invalid_grant`, token revogado, token mal salvo ou perda de sincronização entre sessão e cofre local.
- Há também deriva de estado entre:
  - flag em `localStorage`
  - credencial WebAuthn em `localStorage`
  - token criptografado no IndexedDB
- O fluxo atual mantém a biometria visível, mas ainda responde com erro genérico demais quando o refresh falha.

Plano de implementação
1. Endurecer o cofre local
- Revisar `src/lib/biometric-storage.ts`.
- Expandir o registro salvo para incluir, além do `refresh_token` criptografado:
  - `access_token` criptografado
  - `expires_at`
  - `updatedAt`
  - metadados de diagnóstico mínimos
- Criar helpers explícitos:
  - `hasBiometricVault(email)`
  - `getMaskedBiometricDiagnostics(email)`
  - `storeBiometricSessionTokens(session)`
  - atualização atômica para evitar sobrescrita parcial.

2. Corrigir a restauração da sessão
- Ajustar `src/lib/biometric.ts` para separar claramente:
  - desbloqueio local por biometria
  - restauração da sessão Supabase
- Fluxo final:
  - biometria aprovada
  - ler tokens do cofre
  - se `access_token` ainda estiver válido, restaurar de forma direta
  - se não estiver, usar `refreshSession({ refresh_token })`
  - ao obter nova sessão, regravar imediatamente os tokens rotacionados no cofre
- Se o refresh falhar:
  - não desativar biometria
  - não limpar toggle
  - manter credencial ativa
  - exibir fallback para login manual com mensagem real e clara.

3. Sincronizar melhor com o Supabase
- Revisar `src/contexts/AuthContext.tsx`.
- Garantir atualização do cofre em todos os eventos relevantes:
  - `SIGNED_IN`
  - `TOKEN_REFRESHED`
  - `INITIAL_SESSION`
  - `USER_UPDATED`
- Após login manual com senha, capturar a sessão já resolvida e persistir tokens corretos no cofre sem depender de timing do listener.
- Confirmar que logout manual continua apenas local e não revoga o token remotamente.

4. Corrigir a UI da biometria
- Revisar `src/pages/Auth.tsx` e `src/components/auth/ChangePasswordDialog.tsx`.
- Fazer o botão/toggle refletirem o estado real do cofre + credencial, sem “desmarcar sozinho”.
- Trocar erro genérico por mensagens específicas:
  - token inválido
  - token expirado/revogado
  - token ausente
  - falha de leitura do cofre
- Manter a biometria disponível mesmo após falha de refresh, como solicitado.

5. Validar se o problema é de código ou de configuração do Supabase
- Conferir logs de Auth para descobrir o erro exato retornado pelo refresh.
- Se aparecer `invalid_grant`/revogação recorrente, validar configuração de sessão/refresh token no Supabase antes de mexer em mais lógica.
- Só ajustar configuração do Supabase se os logs mostrarem que o token está sendo invalidado cedo demais.

Logs que vou adicionar
- estado do cofre ao abrir o app
- presença de `refresh_token` e `access_token` mascarados
- hora da última atualização do cofre
- início da tentativa de refresh
- erro exato retornado pelo Supabase
- confirmação de rotação bem-sucedida do token após refresh

Arquivos que pretendo ajustar
- `src/lib/biometric-storage.ts`
- `src/lib/biometric.ts`
- `src/contexts/AuthContext.tsx`
- `src/pages/Auth.tsx`
- `src/components/auth/ChangePasswordDialog.tsx`

Validação obrigatória após implementar
1. Login com senha → ativar biometria → fechar app → reabrir → biometria restaura sessão.
2. Logout manual → abrir app → biometria continua disponível → restaura sessão.
3. Token expirado/revogado → biometria desbloqueia localmente → app cai em fallback sem desativar biometria.
4. Confirmar que o login normal continua intacto.
5. Confirmar em logs qual era a causa real do erro atual.

Resultado esperado
- biometria continua ativa no dispositivo
- toggle não desmarca sozinho
- sessão é restaurada automaticamente após biometria
- quando houver falha real no refresh, o app faz fallback limpo sem “quebrar” a biometria
- o login por e-mail/senha permanece exatamente funcionando como hoje
