// =============================================================================
// ORDO SYSTEM EXPORTS
// =============================================================================
// Structured "Ordo" (Orders) bucket with subtypes:
// - Médicaments → Ordonnance médicale (Rx PDF)
// - Biologie → Demande de bilan (Lab request)
// - Imagerie → Demande d'examen (Imaging request)
// - Actes/Procédures → Referral / Consent form

// Types
export type {
  OrdoItemType,
  OrdoItem,
  OrdoMedicationItem,
  OrdoLabItem,
  OrdoImagingItem,
  OrdoProcedureItem,
  OrdoTemplate,
} from '@/types/ordo';

// Helpers
export {
  createOrdoMedication,
  createOrdoLab,
  createOrdoImaging,
  createOrdoProcedure,
  createOrdoFromTemplate,
  validateOrdoItem,
  isOrdoItemComplete,
  getOrdoTypeIcon,
  getOrdoTypeLabel,
  getOrdoGeneratesLabel,
  LAB_TEMPLATES,
  IMAGING_TEMPLATES,
} from '@/types/ordo';

// Components
export { OrdoItemCard, OrdoTypeIcon } from './ordo-item-card';
export { OrdoBucket } from './ordo-bucket';
export { GenerateSendDrawer } from './generate-send-drawer';
