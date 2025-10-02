# 🧪 Extensão de Testes de Usabilidade

## 📌 Objetivo
Esta extensão foi criada para **avaliar automaticamente a usabilidade e acessibilidade de páginas web**.  
Ela identifica e executa testes em **inputs, botões e formulários**, gerando relatórios detalhados em **JSON, CSV, HTML ou PDF**.

---

## ⚙️ Funcionalidades
- ✅ **Coleta de componentes visíveis**: detecta `form`, `input`, `textarea`, `select`, `button` e elementos com `role="form"` ou `role="button"`.  
- ✅ **Testes automáticos**:
  - **Ortografia**: usando [LanguageTool API](https://languagetool.org) para verificar textos de labels e botões.  
  - **Alinhamento**: garante que `label` esteja corretamente posicionado em relação ao campo (método por centroide).  
  - **Acessibilidade**: falha em campos sem label, placeholder ou atributos `aria`.  
  - **Ordem de Tabulação**: valida a navegação via `Tab`.  
- ✅ **Exportação dos resultados**:  
  - JSON → Estrutura hierárquica para uso técnico.  
  - CSV → Compatível com Excel/Google Sheets.  
  - HTML → Relatório visual pronto para análise.  
  - PDF → Relatório gerado automaticamente a partir do HTML.  
- ✅ **Persistência**: resultados são salvos e reaparecem ao reabrir a extensão.

---

## 📂 Estrutura dos Arquivos
<img width="756" height="168" alt="image" src="https://github.com/user-attachments/assets/f396f616-eeaa-4b13-8edb-893b46e3beab" />

---

## 🚀 Como funciona
1. O usuário abre a extensão e clica em **"Executar Testes"**.  
2. O `popup.js` injeta a função `collectVisibleComponents()` na aba ativa.  
3. A função retorna todos os componentes visíveis com rótulos, posições e acessibilidade.  
4. A extensão aplica testes adicionais:
   - Ortografia (LanguageTool)
   - Alinhamento (centroide)
   - Acessibilidade
   - Ordem de Tabulação  
5. Os resultados são exibidos no popup.  
6. O usuário pode exportar para **JSON, CSV, HTML ou PDF**.

---

## 🧪 Exemplos de Saída

### Resumo no Popup
Total de Testes: 18
Aprovados: 15
Reprovados: 3
Taxa de Sucesso: 83.3%
Ordem de Tabulação: PASS - Ordem de tabulação correta

### Exemplo de registro em JSON
```json
{
  "label": "Nome",
  "type": "input",
  "tests": [
    {
      "test": "Ortografia",
      "result": "PASS",
      "details": "Ortografia correta"
    },
    {
      "test": "Alinhamento label",
      "result": "PASS",
      "details": "Label próximo e visualmente alinhado ao campo"
    }
  ]
}

