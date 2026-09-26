# TerapiaInFoco — Landing Page Institucional & Simulador Clínico

Landing page oficial desenvolvida para a plataforma de gestão clínica psicológica **TerapiaInFoco**, concebida e parametrizada estritamente com base na documentação técnica e regulatória da **RFC-001** (*Plataforma de Gestão Clínica Psicológica com Teleatendimento, Transcrição Assistida por IA e Criptografia LGPD*).

---

## 🌟 Visão Geral e Módulos Implementados

A landing page apresenta com precisão técnica e apelo visual premium todos os 5 módulos e requisitos de conformidade da RFC-001:

1. **Hero & Proposta de Valor:**
   - Posicionamento clínico: telepsicologia sem fricção, redução de horas digitando prontuários e segurança jurídica.
   - Demonstração interativa de sessão encerrada no Google Meet com rascunho SOAP em tempo real.
   - Badges de conformidade com Resoluções CFP nº 011/2018 (e-Psi), 001/2009 e LGPD Art. 11.

2. **Simulador Interativo de IA Clínica (Módulo 3 - RFC §3.3):**
   - Alternância entre casos reais (TCC - Ansiedade Ocupacional vs. Psicologia Humanista - Luto).
   - Simulação de reprodutor de áudio com gráfico de ondas do Google Meet.
   - Transcrição diarizada segregando locutores (`[TERAPEUTA]` vs `[PACIENTE]`).
   - Pipeline de processamento assistido por IA estruturado nos 4 eixos **SOAP** (Subjetivo, Objetivo, Avaliação, Plano).
   - Princípio **Human-in-the-Loop** com campos totalmente editáveis pelo terapeuta e aba de anotações reflexivas privadas segregadas (§3.4).
   - Selo e assinatura digital com carimbo do tempo e hash SHA-256.

3. **Arquitetura de Segurança & Criptografia (Seção 4 da RFC):**
   - Exploração do modelo de **Envelope Encryption** (AES-256-GCM + Cloud KMS / HSM).
   - Alternador interativo entre a **Visão do Invasor/DBA** (lixo cifrado ilegível) e a **Visão do Psicólogo Autenticado** (dados decriptados apenas em memória volátil).
   - Simulador ao vivo de **Blind Indexing** (`HMAC-SHA256`) para busca de CPF sem expor dados sensíveis.
   - Explicação da política de **Quarentena Criptográfica** para harmonização entre o direito ao esquecimento (LGPD Art. 18) e a guarda legal obrigatória de 5 anos pelo CFP (Resolução nº 001/2009).

4. **Emissão de Laudos & Documentos CFP (Módulo 5 - RFC §3.5):**
   - Modelos normatizados pela Resolução CFP nº 006/2019: *Atestado Psicológico*, *Declaração de Comparecimento* e *Relatório Psicológico*.
   - Simulação de autenticidade documental com padrão PDF/A, assinatura ICP-Brasil (PAdES) e validação pública via QR Code.

5. **Calculadora de Retorno de Tempo & ROI:**
   - Sliders dinâmicos para cálculo de horas gastas em prontuários manuais vs. TerapiaInFoco, demonstrando a recuperação de até 25+ horas livres por mês.

6. **Tabela Comparativa Deontológica:**
   - Comparativo detalhado: TerapiaInFoco vs. WhatsApp/Meet avulso vs. Prontuários Médicos Genéricos vs. ChatGPT público.

7. **Planos & Preços com Modal de Inscrição VIP:**
   - Tiers Autônomo, Pro Clínico e Clínicas com toggle Mensal / Anual.
   - Modal de captura de leads com validação de CRP e emissão de token de acesso antecipado.

---

## 🚀 Como Executar o Projeto

Este projeto utiliza **React 19**, **Vite**, **TypeScript**, **Tailwind CSS v4** e **Lucide React**, executado com **Bun**.

### 1. Pré-requisitos
- [Bun](https://bun.com/) (já instalado no ambiente via Homebrew).

### 2. Rodar o servidor de desenvolvimento
```bash
bun dev
```
Acesse `http://localhost:5173/` no navegador.

### 3. Rodar a versão de produção (Build & Preview)
```bash
# Compilar TypeScript e Vite
bun run build

# Iniciar servidor de visualização
bun run preview
```
O servidor de visualização estará disponível em `http://localhost:4173/`.

---

## 🔒 Conformidade Legal & Segurança
- **LGPD (Lei nº 13.709/2018):** Art. 5º, II (Dados Pessoais Sensíveis de Saúde), Art. 11 (Bases legais de tutela da saúde e consentimento destacado), Art. 16 (Retenção legal).
- **CFP:** Resoluções nº 001/2009, 011/2018, 006/2019, 004/2020 e Art. 9º do Código de Ética Profissional do Psicólogo.
