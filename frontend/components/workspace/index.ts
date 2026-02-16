// Smart Input Components
// Sleek contentEditable-based inputs with AI autocomplete + dropdown suggestions

export { SmartTextarea } from './SmartTextarea';
export { SmartInput } from './SmartInput';

// Order Intents Panel
// Structured orders with Rx, Referral, Follow-up tabs and document generation
export { OrdersPanel } from './orders-panel';

// Template Onboarding Modal
// First-time setup for selecting default templates
export { TemplateOnboardingModal } from './template-onboarding-modal';

// Voice Control (LiveKit-based for Assistant mode)
// Push-to-talk voice Q/A about patients with full database access
export { VoiceControl } from './voice-control';

// Scribe Panel (Direct WebSocket for transcription) - Legacy full panel
// Simple browser mic → WebSocket → Deepgram STT → SOAP summary
export { ScribePanel } from './ScribePanel';

// Voice Scribe (Compact control bar version)
// Compact horizontal bar for scribe mode
export { VoiceScribe } from './VoiceScribe';
