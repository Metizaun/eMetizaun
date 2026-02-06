import { AIChat } from '@/components/AIChat';
export default function AIAssistant() {
  return <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Assistant</h1>
        <p className="text-muted-foreground">
          Get intelligent insights about your CRM data, generate content, and streamline your workflow with AI.
        </p>
      </div>

      <AIChat
        suggestions={[
          "Quantas tasks em aberto eu tenho?",
          "Empresa Acme tem quantas tasks em aberto?",
          "Mostre meus leads mais recentes",
          "Quais sao meus contatos mais recentes?",
          "Crie uma task chamada Follow up Acme",
          "Crie uma nota sobre a negociacao com a Acme",
        ]}
      />
    </div>;
}
