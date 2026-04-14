// Settings section intro UI.

/** Settings section intro props. */
interface SettingsSectionIntroProps {
  description?: string;
  eyebrow: string;
  title: string;
}

/** Renders the settings section intro UI. */
export function SettingsSectionIntro({
  description,
  eyebrow,
  title,
}: SettingsSectionIntroProps) {
  return (
    <>
      <div className="surface-eyebrow">{eyebrow}</div>
      <h2 className="surface-title">{title}</h2>
      {description ? <p className="surface-description">{description}</p> : null}
    </>
  );
}
