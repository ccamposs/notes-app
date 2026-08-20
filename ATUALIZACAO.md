# Como funciona a Atualização Automática

## Resumo
O app usa **Electron** + **electron-updater** para atualizar automaticamente.
Quando você publica uma nova versão no GitHub Releases, o app detecta e atualiza sozinho.

---

## Passo a passo para publicar atualizações

### 1. Configuração inicial (só uma vez)

1. Crie um repositório no GitHub (ex: `notes-app`)
2. Gere um **Personal Access Token** no GitHub:
   - Vá em: GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
   - Gere um token com permissão `repo`
3. No `package.json`, atualize a seção `build.publish`:
   ```json
   "publish": {
     "provider": "github",
     "owner": "SEU_USUARIO",
     "repo": "notes-app"
   }
   ```
4. Defina a variável de ambiente:
   ```
   set GH_TOKEN=seu_token_aqui
   ```

### 2. Para gerar o instalador (.exe)

```bash
npm run electron:build
```

O instalador estará em `release/Notes App Setup 1.0.0.exe`

### 3. Para publicar uma atualização

1. Altere a `version` no `package.json` (ex: `1.0.0` → `1.1.0`)
2. Execute:
   ```bash
   set GH_TOKEN=seu_token
   npm run electron:publish
   ```
3. Isso faz o build e publica automaticamente no GitHub Releases

### 4. O que acontece no app do usuário

- O app verifica atualizações ao abrir
- Se encontra uma nova versão, baixa automaticamente em background
- Mostra um banner: "Nova versão disponível! Reiniciar e atualizar"
- Ao clicar, reinicia e aplica a atualização

---

## Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Roda o app web (Vite) |
| `npm run electron:dev` | Roda o Electron em modo dev |
| `npm run electron:build` | Gera o instalador .exe |
| `npm run electron:publish` | Gera e publica no GitHub |

---

## Notas importantes

- O auto-update só funciona no `.exe` instalado (não no modo dev)
- O GitHub Releases precisa ter o token configurado para publicar
- Cada nova versão precisa ter a `version` no `package.json` incrementada
- O usuário NÃO precisa baixar o instalador novamente manualmente
