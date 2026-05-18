// FILE: frontend/src/components/ui/index.js
// Barrel export dei mattoni UI condivisi TRGB-02 (M.I).
//
// Uso:
//   import {
//     Btn, PageLayout, StatusBadge, EmptyState,
//     FieldLabel, TextInput, Select, Textarea,
//     Card, SectionTitle, Modal, Stepper, Pill, PillGroup,
//   } from "../../components/ui";

// Primitivi storici (M.I sessione 2026-04-18)
export { default as Btn }         from "./Btn";
export { default as PageLayout }  from "./PageLayout";
export { default as StatusBadge } from "./StatusBadge";
export { default as EmptyState }  from "./EmptyState";

// Primitivi M.I espansione (sessione 2026-05-16) — form/contenitori/wizard
export { default as FieldLabel }   from "./FieldLabel";
export { default as TextInput }    from "./TextInput";
export { default as Select }       from "./Select";
export { default as Textarea }     from "./Textarea";
export { default as Card }         from "./Card";
export { default as SectionTitle } from "./SectionTitle";
export { default as Modal }        from "./Modal";
export { default as Stepper }      from "./Stepper";
export { default as Pill, PillGroup } from "./Pill";
