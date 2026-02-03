import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PenTool, Instagram, Mail, Phone, Sparkles } from 'lucide-react';
import { ComposerInterface } from '@/components/ComposerInterface';
import { useComposer } from '@/hooks/useComposer';

export default function Composer() {
  const { loadTemplates, loadSequences } = useComposer();

  useEffect(() => {
    loadTemplates();
    loadSequences();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <PenTool className="h-8 w-8 text-primary" />
          AI Composer
        </h1>
        <p className="text-muted-foreground">
          Create professional content with AI assistance. Generate Instagram visuals, emails, text messages, and more.
        </p>
      </div>

      <Tabs defaultValue="instagram" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="instagram" className="flex items-center gap-2">
            <Instagram className="h-4 w-4" />
            Instagram
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Whatsapp Messages
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instagram" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5 text-primary" />
                Instagram Visual Studio
              </CardTitle>
              <CardDescription>
                Crie fotos de produtos profissionais, edite fundos e gere conteúdo visual engajador para seu feed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComposerInterface 
                contentType="instagram"
                placeholder="Descreva a imagem que você quer gerar para o seu feed..."
                suggestions={[
                  "Colocar meu produto em uma mesa de café da manhã ensolarada",
                  "Criar um fundo estúdio minimalista cor pastel",
                  "Transforme esta foto em estilo cinematográfica de estudio",
                  "Remover o fundo e colocar em uma paisagem de praia luxuosa"
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email Content Generator
              </CardTitle>
              <CardDescription>
                Create compelling email campaigns, follow-ups, and automated sequences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComposerInterface 
                contentType="email"
                placeholder="Generate a follow-up email for a sales prospect who downloaded our whitepaper..."
                suggestions={[
                  "Write a welcome email for new subscribers",
                  "Create a follow-up sequence for trial users",
                  "Generate a re-engagement email for inactive contacts",
                  "Write a product announcement email"
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Whatsapp Content Generator
              </CardTitle>
              <CardDescription>
                Create concise and effective Whatsapp message campaigns and follow-ups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComposerInterface 
                contentType="sms"
                placeholder="Create a reminder Whatsapp for an upcoming appointment..."
                suggestions={[
                  "Write an appointment reminder message",
                  "Create a promotional Whatsapp for a sale",
                  "Generate a follow-up Whatsapp after a service call",
                  "Write a thank you message for a purchase"
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Custom Content Generator
              </CardTitle>
              <CardDescription>
                Generate any type of content with custom requirements and specifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComposerInterface 
                contentType="custom"
                placeholder="Create content for any specific purpose or platform..."
                suggestions={[
                  "Write a social media post for a product launch",
                  "Create a press release template",
                  "Generate a blog post outline",
                  "Write a case study introduction"
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
