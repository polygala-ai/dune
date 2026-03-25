interface SettingsSectionIntroProps {
  description: string;
  eyebrow: string;
  title: string;
}

export function SettingsSectionIntro({
  description,
  eyebrow,
  title,
}: SettingsSectionIntroProps) {
  return (
    <>
      <div className="surface-eyebrow">{eyebrow}</div>
      <h2 className="surface-title">{title}</h2>
      <p className="surface-description">{description}</p>
    </>
  );
}
