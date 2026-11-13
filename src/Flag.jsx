import React from "react";
import {
  Archive,
  BookOpen,
  Bookmark,
  Briefcase,
  Building2,
  Coffee,
  FlaskConical,
  Folder,
  FolderOpen,
  Globe2,
  GraduationCap,
  Heart,
  HeartPulse,
  Laptop,
  Leaf,
  Plane,
  School,
  Star,
  Target,
  Users,
} from "lucide-react";
import { COUNTRY_CODES, countryCodeFromValue } from "./directory-symbols.js";
const countrySet = new Set([...COUNTRY_CODES, "XA", "XC", "XO"]);
const iconComponents = {
  folder: Folder,
  "folder-open": FolderOpen,
  archive: Archive,
  bookmark: Bookmark,
  briefcase: Briefcase,
  building: Building2,
  users: Users,
  laptop: Laptop,
  globe: Globe2,
  target: Target,
  education: GraduationCap,
  book: BookOpen,
  school: School,
  science: FlaskConical,
  star: Star,
  heart: Heart,
  leaf: Leaf,
  coffee: Coffee,
  travel: Plane,
  health: HeartPulse,
};
export default function Flag({ value }) {
  const text = typeof value === "string" ? value.trim() : "";
  const code = countryCodeFromValue(text);
  if (countrySet.has(code))
    return (
      <img
        className="country-flag"
        src={`/flags/${code}.svg`}
        alt=""
        aria-hidden="true"
        width="24"
        height="16"
        draggable="false"
      />
    );
  const key = text.startsWith("icon:")
    ? text.slice(5)
    : text === "📂"
      ? "folder-open"
      : !text || text === "📁"
        ? "folder"
        : null;
  const Icon = iconComponents[key];
  if (Icon)
    return (
      <Icon className="directory-symbol-icon" size={20} aria-hidden="true" />
    );
  return (
    <span className="custom-flag" aria-hidden="true">
      {text || "📁"}
    </span>
  );
}
