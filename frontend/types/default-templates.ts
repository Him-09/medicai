// Default Template Packs for MedicAI
// These are used when doctor hasn't set their own templates

import { OrderTemplate } from './orders';

// =============================================================================
// PRESCRIPTION (ORDONNANCE) TEMPLATES
// =============================================================================
export const prescriptionTemplates: OrderTemplate[] = [
  {
    id: 'default-rx-general',
    name: 'Ordonnance Générale',
    type: 'rx',
    specialty: 'general',
    visit_type: 'all',
    is_default: true,
    is_user_custom: false,
    template_html: `
      <div class="prescription" dir="auto" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; color: #333;">Dr. {{doctor_name}}</h2>
            <p style="margin: 5px 0; color: #666; font-size: 14px;">{{doctor_specialty}}</p>
            <p style="margin: 5px 0; color: #666; font-size: 12px;">{{clinic_address}}</p>
            <p style="margin: 5px 0; color: #666; font-size: 12px;">Tél: {{clinic_phone}}</p>
          </div>
          <div style="text-align: right;">
            <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">ORDONNANCE</h1>
            <p style="margin: 10px 0; color: #666;">{{date}}</p>
          </div>
        </div>
        
        <!-- Patient Info -->
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0;"><strong>Patient:</strong> {{patient_name}}</p>
          <p style="margin: 5px 0;"><strong>Né(e) le:</strong> {{patient_dob}} | <strong>Âge:</strong> {{patient_age}} ans</p>
        </div>
        
        <!-- Medications -->
        <div style="margin-bottom: 30px;">
          {{#each medications}}
          <div style="padding: 15px 0; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: baseline; gap: 10px;">
              <span style="font-size: 18px; font-weight: bold; color: #333;">{{@index+1}}.</span>
              <div>
                <p style="margin: 0; font-size: 16px; font-weight: 600;">{{name}} {{dosage}} - {{form}}</p>
                <p style="margin: 5px 0; color: #555;">{{frequency}} pendant {{duration}}</p>
                {{#if instructions}}
                <p style="margin: 5px 0; color: #666; font-style: italic;">📋 {{instructions}}</p>
                {{/if}}
                {{#if quantity}}
                <p style="margin: 5px 0; color: #888; font-size: 12px;">Quantité: {{quantity}} | Renouvellements: {{refills}}</p>
                {{/if}}
              </div>
            </div>
          </div>
          {{/each}}
        </div>
        
        {{#if general_instructions}}
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; font-weight: 600;">⚠️ Instructions générales:</p>
          <p style="margin: 5px 0;">{{general_instructions}}</p>
        </div>
        {{/if}}
        
        <!-- Footer -->
        <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: end;">
          <div>
            {{#if valid_until}}
            <p style="color: #666; font-size: 12px;">Valable jusqu'au: {{valid_until}}</p>
            {{/if}}
            {{#if renewable}}
            <p style="color: #28a745; font-size: 12px;">✓ Renouvelable</p>
            {{/if}}
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #333; width: 200px; margin-top: 60px; padding-top: 5px;">
              <p style="margin: 0; font-size: 12px;">Signature et cachet</p>
            </div>
          </div>
        </div>
      </div>
    `,
    template_text: `
ORDONNANCE
Date: {{date}}

Dr. {{doctor_name}}
{{doctor_specialty}}
{{clinic_address}}
Tél: {{clinic_phone}}

Patient: {{patient_name}}
Né(e) le: {{patient_dob}} | Âge: {{patient_age}} ans

---

{{#each medications}}
{{@index+1}}. {{name}} {{dosage}} - {{form}}
   {{frequency}} pendant {{duration}}
   {{#if instructions}}Instructions: {{instructions}}{{/if}}
   {{#if quantity}}Quantité: {{quantity}} | Renouvellements: {{refills}}{{/if}}

{{/each}}

{{#if general_instructions}}
Instructions générales: {{general_instructions}}
{{/if}}

{{#if valid_until}}Valable jusqu'au: {{valid_until}}{{/if}}
{{#if renewable}}Renouvelable{{/if}}

Signature: _______________
    `,
    prefill_rules: [
      {
        condition: "problem.title.toLowerCase().includes('hta') || problem.title.toLowerCase().includes('hypertension')",
        prefill_data: {
          medications: [
            { id: '', name: 'Amlodipine', dosage: '5mg', form: 'comprimé', frequency: '1x/jour le matin', duration: '30 jours' }
          ]
        }
      },
      {
        condition: "problem.title.toLowerCase().includes('diabète') || problem.title.toLowerCase().includes('diabetes')",
        prefill_data: {
          medications: [
            { id: '', name: 'Metformine', dosage: '500mg', form: 'comprimé', frequency: '2x/jour', duration: '30 jours', instructions: 'À prendre pendant les repas' }
          ]
        }
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// =============================================================================
// REFERRAL LETTER TEMPLATES
// =============================================================================
export const referralTemplates: OrderTemplate[] = [
  {
    id: 'default-referral-general',
    name: 'Lettre de Référence',
    type: 'referral',
    specialty: 'general',
    visit_type: 'all',
    is_default: true,
    is_user_custom: false,
    template_html: `
      <div class="referral-letter" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <h2 style="margin: 0; color: #333;">Dr. {{doctor_name}}</h2>
              <p style="margin: 5px 0; color: #666; font-size: 14px;">{{doctor_specialty}}</p>
              <p style="margin: 5px 0; color: #666; font-size: 12px;">{{clinic_address}}</p>
              <p style="margin: 5px 0; color: #666; font-size: 12px;">Tél: {{clinic_phone}} | Email: {{clinic_email}}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; color: #666;">{{date}}</p>
            </div>
          </div>
        </div>
        
        <!-- Recipient -->
        <div style="margin-bottom: 25px;">
          <p style="margin: 0;"><strong>À l'attention de:</strong></p>
          <p style="margin: 5px 0; font-size: 16px;">{{#if to_provider_name}}Dr. {{to_provider_name}}{{else}}Cher(e) Confrère/Consœur{{/if}}</p>
          <p style="margin: 0; color: #666;">Service de {{to_specialty}}</p>
        </div>
        
        <!-- Subject -->
        <div style="background: {{#if urgency_urgent}}#f8d7da{{else}}#e7f3ff{{/if}}; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; font-weight: 600;">
            {{#if urgency_urgent}}🚨 URGENT - {{/if}}
            Objet: Demande d'avis spécialisé pour {{patient_name}}
          </p>
        </div>
        
        <!-- Patient Info -->
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0;"><strong>Patient:</strong> {{patient_name}}</p>
          <p style="margin: 5px 0;"><strong>Né(e) le:</strong> {{patient_dob}} | <strong>Âge:</strong> {{patient_age}} ans</p>
        </div>
        
        <!-- Reason -->
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Motif de la référence</h3>
          <p style="margin: 0;">{{reason}}</p>
        </div>
        
        <!-- Clinical Summary -->
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Résumé clinique</h3>
          <p style="margin: 0; white-space: pre-line;">{{clinical_summary}}</p>
        </div>
        
        {{#if relevant_findings.length}}
        <!-- Key Findings -->
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Éléments pertinents</h3>
          <ul style="margin: 0; padding-left: 20px;">
            {{#each relevant_findings}}
            <li>{{this}}</li>
            {{/each}}
          </ul>
        </div>
        {{/if}}
        
        {{#if questions_for_specialist.length}}
        <!-- Questions -->
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Questions spécifiques</h3>
          <ol style="margin: 0; padding-left: 20px;">
            {{#each questions_for_specialist}}
            <li>{{this}}</li>
            {{/each}}
          </ol>
        </div>
        {{/if}}
        
        <!-- Footer -->
        <div style="margin-top: 30px;">
          <p>Je vous remercie par avance de bien vouloir recevoir ce patient et reste à votre disposition pour tout renseignement complémentaire.</p>
          <p>Confraternellement,</p>
          <div style="margin-top: 40px;">
            <div style="border-top: 1px solid #333; width: 200px; margin-top: 60px; padding-top: 5px;">
              <p style="margin: 0;">Dr. {{doctor_name}}</p>
            </div>
          </div>
        </div>
      </div>
    `,
    template_text: `
LETTRE DE RÉFÉRENCE
Date: {{date}}

De: Dr. {{doctor_name}} - {{doctor_specialty}}
{{clinic_address}}
Tél: {{clinic_phone}}

À: {{#if to_provider_name}}Dr. {{to_provider_name}}{{else}}Cher(e) Confrère/Consœur{{/if}}
Service de {{to_specialty}}

{{#if urgency_urgent}}🚨 URGENT{{/if}}

Objet: Demande d'avis spécialisé

Patient: {{patient_name}}
Né(e) le: {{patient_dob}} | Âge: {{patient_age}} ans

---

MOTIF DE LA RÉFÉRENCE:
{{reason}}

RÉSUMÉ CLINIQUE:
{{clinical_summary}}

{{#if relevant_findings.length}}
ÉLÉMENTS PERTINENTS:
{{#each relevant_findings}}- {{this}}
{{/each}}
{{/if}}

{{#if questions_for_specialist.length}}
QUESTIONS SPÉCIFIQUES:
{{#each questions_for_specialist}}{{@index+1}}. {{this}}
{{/each}}
{{/if}}

Confraternellement,
Dr. {{doctor_name}}
    `,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// =============================================================================
// FOLLOW-UP PLAN TEMPLATES
// =============================================================================
export const followupTemplates: OrderTemplate[] = [
  {
    id: 'default-followup-general',
    name: 'Plan de Suivi',
    type: 'followup',
    specialty: 'general',
    visit_type: 'all',
    is_default: true,
    is_user_custom: false,
    template_html: `
      <div class="followup-plan" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">📅 Plan de Suivi</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">{{patient_name}} - {{date}}</p>
        </div>
        
        <!-- Content -->
        <div style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px; padding: 20px;">
          <!-- Next Appointment -->
          <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #1a73e8;">📆 Prochain rendez-vous</h3>
            <p style="margin: 0; font-size: 18px; font-weight: 600;">{{timeframe}}</p>
            {{#if target_date}}
            <p style="margin: 5px 0 0 0; color: #666;">Date prévue: {{target_date}}</p>
            {{/if}}
          </div>
          
          <!-- Reason -->
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Motif du suivi</h3>
            <p style="margin: 0;">{{reason}}</p>
          </div>
          
          <!-- Focus Items -->
          {{#if focus_items.length}}
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Points à surveiller</h3>
            <ul style="margin: 0; padding-left: 20px;">
              {{#each focus_items}}
              <li style="margin-bottom: 8px;">{{this}}</li>
              {{/each}}
            </ul>
          </div>
          {{/if}}
          
          <!-- Labs before visit -->
          {{#if labs_before_visit.length}}
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #856404;">🔬 Examens à réaliser avant la visite</h3>
            <ul style="margin: 0; padding-left: 20px;">
              {{#each labs_before_visit}}
              <li>{{this}}</li>
              {{/each}}
            </ul>
          </div>
          {{/if}}
          
          <!-- Pre-visit instructions -->
          {{#if pre_visit_instructions}}
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">📋 Instructions avant la visite</h3>
            <p style="margin: 0;">{{pre_visit_instructions}}</p>
          </div>
          {{/if}}
          
          <!-- Reminders -->
          {{#if reminders.enabled}}
          <div style="display: flex; align-items: center; gap: 10px; color: #28a745;">
            <span>✓</span>
            <span>Rappel automatique activé ({{reminders.timing}} avant)</span>
          </div>
          {{/if}}
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>Dr. {{doctor_name}} | {{clinic_name}}</p>
          <p>{{clinic_phone}}</p>
        </div>
      </div>
    `,
    template_text: `
PLAN DE SUIVI
Date: {{date}}

Patient: {{patient_name}}

📆 PROCHAIN RENDEZ-VOUS: {{timeframe}}
{{#if target_date}}Date prévue: {{target_date}}{{/if}}

MOTIF DU SUIVI:
{{reason}}

{{#if focus_items.length}}
POINTS À SURVEILLER:
{{#each focus_items}}- {{this}}
{{/each}}
{{/if}}

{{#if labs_before_visit.length}}
EXAMENS À RÉALISER AVANT LA VISITE:
{{#each labs_before_visit}}- {{this}}
{{/each}}
{{/if}}

{{#if pre_visit_instructions}}
INSTRUCTIONS AVANT LA VISITE:
{{pre_visit_instructions}}
{{/if}}

{{#if reminders.enabled}}
✓ Rappel automatique activé
{{/if}}

---
Dr. {{doctor_name}}
{{clinic_name}} | {{clinic_phone}}
    `,
    prefill_rules: [
      {
        condition: "problem.title.toLowerCase().includes('hta')",
        prefill_data: {
          timeframe: '1 mois',
          focus_items: ['Contrôle tensionnel', 'Tolérance du traitement', 'Observance'],
          labs_before_visit: ['Ionogramme sanguin', 'Créatinine']
        }
      },
      {
        condition: "problem.title.toLowerCase().includes('diabète')",
        prefill_data: {
          timeframe: '3 mois',
          focus_items: ['HbA1c', 'Glycémies capillaires', 'Tolérance du traitement'],
          labs_before_visit: ['HbA1c', 'Glycémie à jeun', 'Bilan lipidique'],
          pre_visit_instructions: 'Venir à jeun'
        }
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// =============================================================================
// VISIT NOTE (SOAP) TEMPLATES
// =============================================================================
export const visitNoteTemplates: OrderTemplate[] = [
  {
    id: 'default-visit-note-soap',
    name: 'Note de Visite (SOAP)',
    type: 'visit_note',
    specialty: 'general',
    visit_type: 'all',
    is_default: true,
    is_user_custom: false,
    template_html: `
      <div class="visit-note" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
          <h1 style="margin: 0;">Note de Consultation</h1>
          <p style="margin: 5px 0; color: #666;">{{date}} | {{consultation_name}}</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0;"><strong>Patient:</strong> {{patient_name}} | <strong>Âge:</strong> {{patient_age}} ans</p>
        </div>
        
        <!-- Subjective -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1a73e8; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">S - Subjectif</h2>
          <p><strong>Motif:</strong> {{chief_complaint}}</p>
          <p><strong>Histoire:</strong> {{hpi}}</p>
        </div>
        
        <!-- Objective -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1a73e8; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">O - Objectif</h2>
          {{#if vitals}}
          <p><strong>Signes vitaux:</strong> {{vitals}}</p>
          {{/if}}
          <p><strong>Examen:</strong> {{exam}}</p>
        </div>
        
        <!-- Assessment -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1a73e8; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">A - Évaluation</h2>
          {{#each problems}}
          <div style="margin-bottom: 10px;">
            <p style="margin: 0;"><strong>{{@index+1}}. {{title}}</strong></p>
            {{#if assessment}}<p style="margin: 5px 0 0 15px; color: #555;">{{assessment}}</p>{{/if}}
          </div>
          {{/each}}
        </div>
        
        <!-- Plan -->
        <div style="margin-bottom: 20px;">
          <h2 style="color: #1a73e8; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">P - Plan</h2>
          {{#each problems}}
          <div style="margin-bottom: 15px;">
            <p style="margin: 0; font-weight: 600;">{{title}}:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              {{#each plan_items}}
              <li>{{this}}</li>
              {{/each}}
            </ul>
          </div>
          {{/each}}
        </div>
        
        <!-- Signature -->
        <div style="margin-top: 40px; text-align: right;">
          <p>Dr. {{doctor_name}}</p>
        </div>
      </div>
    `,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// =============================================================================
// ALL DEFAULT TEMPLATES
// =============================================================================
export const defaultTemplates: OrderTemplate[] = [
  ...prescriptionTemplates,
  ...referralTemplates,
  ...followupTemplates,
  ...visitNoteTemplates,
];

// Get template by type and optionally specialty
export const getDefaultTemplate = (
  type: OrderTemplate['type'],
  specialty?: string
): OrderTemplate | undefined => {
  return defaultTemplates.find(t => 
    t.type === type && 
    t.is_default && 
    (!specialty || t.specialty === specialty || t.specialty === 'general')
  );
};

// Get all templates for a type
export const getTemplatesForType = (type: OrderTemplate['type']): OrderTemplate[] => {
  return defaultTemplates.filter(t => t.type === type);
};
