# Diretrizes Operacionais de Desenvolvimento — TerapiaInFoco

## 🎯 Protocolo Obrigatório de Continuidade & Roadmap

1. **Consulta Prévia ao Roadmap:**
   - Ao iniciar qualquer nova tarefa, funcionalidade ou sessão, consulte sempre o arquivo [`ROADMAP_PROGRESS.md`](./ROADMAP_PROGRESS.md) na raiz do projeto para identificar o estado atual de desenvolvimento e os itens pendentes.
   - Siga o fluxo definido na skill `.agents/skills/roadmap-tracker/SKILL.md`.

2. **Disciplina Estrita de Branches:**
   - **NUNCA faça commit diretamente na branch `main`**.
   - Sempre crie e trabalhe em uma branch temática dedicada antes de modificar arquivos:
     ```bash
     git checkout main && git pull origin main
     git checkout -b feat/<nome-da-funcionalidade>
     ```

3. **Atualização Contínua do Roadmap:**
   - Ao concluir uma implementação, atualize obrigatoriamente [`ROADMAP_PROGRESS.md`](./ROADMAP_PROGRESS.md):
     - Marque os itens finalizados com `[x]`.
     - Adicione ou refine os próximos passos com `[ ]`.
     - Registre o novo Pull Request na tabela de histórico de branches.

4. **Qualidade & Validação:**
   - Garanta que todos os testes passem com `make test` (`bun test`).
   - Garanta que a compilação do frontend funcione com `bun run build:frontend`.
   - Preserve o suporte a ambos os temas: **Light Mode** e **Dark Mode**.
