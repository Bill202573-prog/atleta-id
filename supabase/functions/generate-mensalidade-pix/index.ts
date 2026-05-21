import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface MensalidadePixRequest {
  mensalidade_id: string;
}

interface AsaasPaymentResponse {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  billingType: string;
  pixQrCodeId?: string;
  errors?: Array<{ code: string; description: string }>;
}

interface AsaasPixQrCodeResponse {
  id: string;
  encodedImage: string;
  payload: string;
  expirationDate: string;
  errors?: Array<{ code: string; description: string }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ASAAS_API_KEY) {
      console.error('Missing ASAAS_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Configuração de pagamento não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { mensalidade_id }: MensalidadePixRequest = await req.json();

    console.log('Generating PIX for mensalidade:', mensalidade_id);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(mensalidade_id)) {
      return new Response(
        JSON.stringify({ error: 'ID de mensalidade inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch mensalidade with related data including responsavel and escola's cadastro bancario
    const { data: mensalidade, error: mensalidadeError } = await supabase
      .from('mensalidades')
      .select(`
        id,
        valor,
        mes_referencia,
        status,
        data_vencimento,
        asaas_payment_id,
        crianca_id,
        escolinha_id,
        crianca:criancas!mensalidades_crianca_id_fkey(
          id,
          nome,
          crianca_responsavel(
            responsavel:responsaveis(
              id,
              nome,
              email,
              telefone,
              cpf
            )
          )
        ),
        escolinha:escolinhas!mensalidades_escolinha_id_fkey(
          id,
          nome,
          escola_cadastro_bancario(
            asaas_account_id,
            asaas_status
          )
        )
      `)
      .eq('id', mensalidade_id)
      .single();

    if (mensalidadeError || !mensalidade) {
      console.error('Mensalidade not found:', mensalidadeError);
      return new Response(
        JSON.stringify({ error: 'Mensalidade não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already paid (case-insensitive)
    if (mensalidade.status?.toLowerCase() === 'pago') {
      return new Response(
        JSON.stringify({ error: 'Esta mensalidade já foi paga' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract escola's Asaas account (subconta) - handle Supabase's dynamic relation types
    const escolinhaRaw = mensalidade.escolinha as unknown;
    const escolinhaData = escolinhaRaw as { 
      id: string; 
      nome: string;
      escola_cadastro_bancario: Array<{ asaas_account_id: string | null; asaas_status: string | null }> | null 
    } | null;

    // Get the school's own API key directly from the database
    const { data: cadastroBancarioFull, error: cadastroError } = await supabase
      .from('escola_cadastro_bancario')
      .select('asaas_account_id, asaas_api_key, asaas_status, multa_percentual, juros_mes_percentual')
      .eq('escolinha_id', mensalidade.escolinha_id)
      .maybeSingle();
    
    // CRITICAL: Use school's subconta API key - payments MUST go to school's account
    if (!cadastroBancarioFull?.asaas_api_key) {
      console.error("School does not have Asaas subconta configured:", mensalidade.escolinha_id);
      return new Response(
        JSON.stringify({ error: 'Esta escola não possui subconta Asaas configurada. Configure o cadastro bancário primeiro.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeApiKey = cadastroBancarioFull.asaas_api_key;
    const multaPct = Number(cadastroBancarioFull.multa_percentual ?? 2);
    const jurosPct = Number(cadastroBancarioFull.juros_mes_percentual ?? 1);
    console.log("Using school's Asaas subconta. Multa%:", multaPct, "Juros%/mês:", jurosPct);

    // ============================================================
    // REAPROVEITAR COBRANÇA EXISTENTE quando já há asaas_payment_id.
    // Resolve o erro de "pagamento vencido": busca o payment e, se
    // ainda for pagável (PENDING/OVERDUE), pede um QR novo ao Asaas
    // já com multa + juros embutidos no valor.
    // ============================================================
    if (mensalidade.asaas_payment_id) {
      try {
        const existingResp = await fetch(`${ASAAS_API_URL}/payments/${mensalidade.asaas_payment_id}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'access_token': activeApiKey },
        });
        const existing = await existingResp.json();
        console.log('Existing payment status:', existing?.status, 'id:', existing?.id);

        const reusableStatuses = ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'];
        if (existing?.id && reusableStatuses.includes(String(existing.status ?? '').toUpperCase())) {
          const qrResp = await fetch(`${ASAAS_API_URL}/payments/${existing.id}/pixQrCode`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'access_token': activeApiKey },
          });
          const qr = await qrResp.json();
          if (qr?.payload && qr?.encodedImage) {
            const valorAtual = Number(existing.value ?? mensalidade.valor);
            return new Response(
              JSON.stringify({
                success: true,
                data: {
                  pixId: existing.id,
                  brCode: qr.payload,
                  qrCodeUrl: `data:image/png;base64,${qr.encodedImage}`,
                  expiresAt: qr.expirationDate,
                  valor: valorAtual,
                  valorOriginal: Number(mensalidade.valor),
                  mesReferencia: mensalidade.mes_referencia,
                  status: existing.status,
                },
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          console.warn('Não foi possível regerar QR — prosseguindo para criar payment novo');
        } else {
          console.log('Payment existente não é reaproveitável (status:', existing?.status, ') — criando novo');
        }
      } catch (e) {
        console.error('Erro ao reaproveitar payment existente, criando novo:', e);
      }
    }

    // Extract names from relations - handle Supabase's dynamic relation types
    const criancaRaw = mensalidade.crianca as unknown;
    const criancaData = criancaRaw as { 
      id: string; 
      nome: string;
      crianca_responsavel: Array<{ responsavel: { id: string; nome: string; email: string; telefone: string | null; cpf: string | null } | null }> | null 
    } | null;
    
    const criancaNome = criancaData?.nome;
    const escolinhaNome = escolinhaData?.nome;
    
    // Get responsavel data
    const responsavel = criancaData?.crianca_responsavel?.[0]?.responsavel;

    // Format month reference for description
    const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [year, month] = mensalidade.mes_referencia.split('-');
    const mesFormatado = `${monthNames[parseInt(month)]}/${year}`;

    // Step 1: Create or find customer in Asaas
    let customerId: string | null = null;
    
    if (responsavel) {
      // Search for existing customer by CPF or email
      const searchCpf = responsavel.cpf?.replace(/\D/g, '');
      let searchQuery = responsavel.email;
      
      if (searchCpf) {
        // Search by CPF first
        const customerSearchResponse = await fetch(
          `${ASAAS_API_URL}/customers?cpfCnpj=${searchCpf}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'access_token': activeApiKey,
            },
          }
        );
        
        const customerSearchResult = await customerSearchResponse.json();
        console.log('Customer search by CPF result:', JSON.stringify(customerSearchResult));
        
        if (customerSearchResult.data?.length > 0) {
          customerId = customerSearchResult.data[0].id;
        }
      }
      
      if (!customerId) {
        // Search by email
        const customerSearchResponse = await fetch(
          `${ASAAS_API_URL}/customers?email=${encodeURIComponent(responsavel.email)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'access_token': activeApiKey,
            },
          }
        );
        
        const customerSearchResult = await customerSearchResponse.json();
        console.log('Customer search by email result:', JSON.stringify(customerSearchResult));
        
        if (customerSearchResult.data?.length > 0) {
          customerId = customerSearchResult.data[0].id;
        }
      }
      
      // Create customer if not found
      if (!customerId) {
        const customerPayload: Record<string, unknown> = {
          name: responsavel.nome,
          email: responsavel.email,
          mobilePhone: responsavel.telefone?.replace(/\D/g, ''),
          cpfCnpj: responsavel.cpf?.replace(/\D/g, ''),
          notificationDisabled: true,
        };
        
        // Remove undefined values
        Object.keys(customerPayload).forEach(key => {
          if (customerPayload[key] === undefined || customerPayload[key] === null || customerPayload[key] === '') {
            delete customerPayload[key];
          }
        });

        console.log('Creating customer:', JSON.stringify(customerPayload));

        const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': activeApiKey,
          },
          body: JSON.stringify(customerPayload),
        });

        const customerResult = await customerResponse.json();
        console.log('Customer creation result:', JSON.stringify(customerResult));

        if (customerResult.errors) {
          console.error('Error creating customer:', customerResult.errors);
          return new Response(
            JSON.stringify({ error: customerResult.errors[0]?.description || 'Erro ao criar cliente' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        customerId = customerResult.id;
      }
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Não foi possível identificar o responsável para a cobrança' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Create PIX payment
    const dueDate = mensalidade.data_vencimento || new Date().toISOString().split('T')[0];
    
    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: 'PIX',
      value: mensalidade.valor,
      dueDate: dueDate,
      description: `Mensalidade - ${criancaNome || 'Aluno'} - ${mesFormatado}`,
      externalReference: mensalidade_id,
    };

    // Multa e juros: Asaas aplica automaticamente após o vencimento.
    if (multaPct > 0) {
      paymentPayload.fine = { value: multaPct, type: 'PERCENTAGE' };
    }
    if (jurosPct > 0) {
      paymentPayload.interest = { value: jurosPct, type: 'PERCENTAGE' };
    }

    console.log('Creating payment:', JSON.stringify(paymentPayload));

    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': activeApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult: AsaasPaymentResponse = await paymentResponse.json();
    console.log('Payment creation result:', JSON.stringify(paymentResult));

    if (paymentResult.errors) {
      console.error('Error creating payment:', paymentResult.errors);
      return new Response(
        JSON.stringify({ error: paymentResult.errors[0]?.description || 'Erro ao criar cobrança PIX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Get PIX QR Code
    const pixQrCodeResponse = await fetch(`${ASAAS_API_URL}/payments/${paymentResult.id}/pixQrCode`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': activeApiKey,
      },
    });

    const pixQrCodeResult: AsaasPixQrCodeResponse = await pixQrCodeResponse.json();
    console.log('PIX QR Code result:', JSON.stringify(pixQrCodeResult));

    if (pixQrCodeResult.errors) {
      console.error('Error getting PIX QR Code:', pixQrCodeResult.errors);
      return new Response(
        JSON.stringify({ error: pixQrCodeResult.errors[0]?.description || 'Erro ao gerar QR Code PIX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update mensalidade with Asaas payment ID
    const { error: updateError } = await supabase
      .from('mensalidades')
      .update({
        asaas_payment_id: paymentResult.id,
        observacoes: `PIX gerado via Asaas em ${new Date().toISOString()}`,
      })
      .eq('id', mensalidade_id);

    if (updateError) {
      console.error('Error updating mensalidade:', updateError);
    }

    // Return PIX data (compatible with existing UI structure)
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          pixId: paymentResult.id,
          brCode: pixQrCodeResult.payload,
          qrCodeUrl: `data:image/png;base64,${pixQrCodeResult.encodedImage}`,
          expiresAt: pixQrCodeResult.expirationDate,
          valor: mensalidade.valor,
          mesReferencia: mensalidade.mes_referencia,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
