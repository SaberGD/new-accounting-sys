
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Language, translations } from '../i18n';

export type ColorThemeId = 'ocean' | 'navy' | 'emerald' | 'violet' | 'rose' | 'amber' | 'teal' | 'ember';

export interface ColorThemeOption {
  id: ColorThemeId;
  nameAr: string;
  nameEn: string;
  badgeAr: string;
  badgeEn: string;
  icon: string;
  primaryHex: string;
  bgPreviewHex: string;
  gradient: string;
  shades: Record<number, string>;
}

export const COLOR_THEMES: Record<ColorThemeId, ColorThemeOption> = {
  navy: {
    id: 'navy',
    nameAr: 'كحلي نيلي (أعماق المحيط)',
    nameEn: 'Navy Royal',
    badgeAr: 'الكحلي الملكي (الافتراضي)',
    badgeEn: 'Default Navy Royal',
    icon: 'fa-compass',
    primaryHex: '#38bdf8',
    bgPreviewHex: '#080f1e',
    gradient: 'from-blue-600 to-indigo-900',
    shades: {
      50: '240 249 255',
      100: '224 242 254',
      200: '186 230 253',
      300: '125 211 252',
      400: '56 189 248',
      500: '14 165 233',
      600: '2 132 199',
      700: '3 105 161',
      800: '7 89 133',
      900: '12 74 110',
    }
  },
  ocean: {
    id: 'ocean',
    nameAr: 'أزرق محيطي (الكلاسيكي)',
    nameEn: 'Ocean Blue',
    badgeAr: 'رمادي داكن كلاسيكي',
    badgeEn: 'Classic Dark',
    icon: 'fa-water',
    primaryHex: '#0284c7',
    bgPreviewHex: '#111827',
    gradient: 'from-sky-500 to-blue-700',
    shades: {
      50: '240 249 255',
      100: '224 242 254',
      200: '186 230 253',
      300: '125 211 252',
      400: '56 189 248',
      500: '14 165 233',
      600: '2 132 199',
      700: '3 105 161',
      800: '7 89 133',
      900: '12 74 110',
    }
  },
  emerald: {
    id: 'emerald',
    nameAr: 'زمردي فاخر (الأخضر الملكي)',
    nameEn: 'Royal Emerald',
    badgeAr: 'أخضر مريح للعين',
    badgeEn: 'Emerald Forest',
    icon: 'fa-gem',
    primaryHex: '#10b981',
    bgPreviewHex: '#03140e',
    gradient: 'from-emerald-400 to-green-700',
    shades: {
      50: '236 253 245',
      100: '209 250 229',
      200: '167 243 208',
      300: '110 231 183',
      400: '52 211 153',
      500: '16 185 129',
      600: '5 150 105',
      700: '4 120 87',
      800: '6 95 70',
      900: '6 78 59',
    }
  },
  violet: {
    id: 'violet',
    nameAr: 'بنفسجي ليل (سحر الأرجوان)',
    nameEn: 'Royal Violet',
    badgeAr: 'بنفسجي ملكي',
    badgeEn: 'Cyber Night',
    icon: 'fa-wand-magic-sparkles',
    primaryHex: '#a855f7',
    bgPreviewHex: '#0a0618',
    gradient: 'from-purple-500 to-indigo-700',
    shades: {
      50: '245 243 255',
      100: '237 233 254',
      200: '221 214 254',
      300: '196 181 253',
      400: '167 139 250',
      500: '139 92 246',
      600: '124 58 237',
      700: '109 40 217',
      800: '91 33 182',
      900: '76 29 149',
    }
  },
  rose: {
    id: 'rose',
    nameAr: 'عنابي قرمزي (أحمر مخملي)',
    nameEn: 'Crimson Wine',
    badgeAr: 'عنابي مخملي جبار',
    badgeEn: 'Velvet Crimson',
    icon: 'fa-fire',
    primaryHex: '#f43f5e',
    bgPreviewHex: '#12060a',
    gradient: 'from-rose-500 to-red-800',
    shades: {
      50: '255 241 242',
      100: '254 226 226',
      200: '254 205 211',
      300: '253 164 175',
      400: '251 113 133',
      500: '244 63 94',
      600: '225 29 72',
      700: '190 18 60',
      800: '159 18 57',
      900: '136 19 55',
    }
  },
  amber: {
    id: 'amber',
    nameAr: 'عنبر ذهبي (دفء الغروب)',
    nameEn: 'Golden Sunset',
    badgeAr: 'ذهبي دافئ',
    badgeEn: 'Warm Amber Gold',
    icon: 'fa-sun',
    primaryHex: '#f59e0b',
    bgPreviewHex: '#120b03',
    gradient: 'from-amber-400 to-orange-600',
    shades: {
      50: '255 251 235',
      100: '254 243 199',
      200: '253 230 138',
      300: '252 211 77',
      400: '251 191 36',
      500: '245 158 11',
      600: '217 119 6',
      700: '180 83 9',
      800: '146 64 14',
      900: '120 53 15',
    }
  },
  teal: {
    id: 'teal',
    nameAr: 'تركواز سايبر (التيل العصرى)',
    nameEn: 'Cyber Teal',
    badgeAr: 'تيل مستقبل أزرق',
    badgeEn: 'Futuristic Teal',
    icon: 'fa-bolt',
    primaryHex: '#14b8a6',
    bgPreviewHex: '#031215',
    gradient: 'from-teal-400 to-cyan-700',
    shades: {
      50: '240 253 250',
      100: '204 251 241',
      200: '153 246 228',
      300: '94 234 212',
      400: '45 212 191',
      500: '20 184 166',
      600: '13 148 136',
      700: '15 118 110',
      800: '17 94 89',
      900: '19 78 74',
    }
  },
  ember: {
      id: 'ember',
      nameAr: 'جمر صابر (هوية المساعد الذكي)',
      nameEn: 'Saber Ember',
      badgeAr: 'مطابق لهوية AI Assistant',
      badgeEn: 'AI Assistant Match',
      icon: 'fa-fire',
      primaryHex: '#c4321f',
      bgPreviewHex: '#0a0a0a',
      gradient: 'from-orange-700 to-red-900',
      shades: {
            50: '252 245 244',
            100: '248 230 228',
            200: '240 204 199',
            300: '230 169 161',
            400: '218 128 116',
            500: '207 87 71',
            600: '196 50 31',
            700: '161 41 25',
            800: '129 33 20',
            900: '102 26 16',
      },
  },
};

interface ThemeContextType {
  theme: 'light' | 'dark';
  colorTheme: ColorThemeId;
  lang: Language;
  toggleTheme: () => void;
  setColorTheme: (colorTheme: ColorThemeId) => void;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>((localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>((localStorage.getItem('colorTheme') as ColorThemeId) || 'navy');
  const [lang, setLang] = useState<Language>((localStorage.getItem('lang') as Language) || 'ar');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('colorTheme', colorTheme);
    const selected = COLOR_THEMES[colorTheme] || COLOR_THEMES.navy;
    const root = document.documentElement;
    Object.entries(selected.shades).forEach(([shade, value]) => {
      root.style.setProperty(`--primary-${shade}`, String(value));
    });
    root.setAttribute('data-color-theme', colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const setColorTheme = (newColorTheme: ColorThemeId) => setColorThemeState(newColorTheme);
  const setLanguage = (newLang: Language) => setLang(newLang);
  const t = (key: keyof typeof translations['en']) => translations[lang][key] || key;

  return (
    <ThemeContext.Provider value={{ theme, colorTheme, toggleTheme, setColorTheme, lang, setLanguage, t }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

