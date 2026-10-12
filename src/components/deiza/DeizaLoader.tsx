import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import styles from './DeizaLoader.module.css';

interface DeizaLoaderProps {
  fullScreen?: boolean;
  language?: string;
  model?: string;
  thinkingSteps?: string[];
}

// A continuous ink thread, with no start/end frame or disappearing stroke.
const INK_THREAD = 'M7 24 C3 15 13 5 22 10 C31 15 20 35 31 32 C41 30 44 18 35 13 C25 7 18 30 7 24 Z';

const cleanStep = (step: string) => step
  .replace(/^#+\s*/, '')
  .replace(/\*\*|__|`/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const InkThread = () => (
  <svg
    className={styles.mark}
    viewBox="0 0 48 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path className={styles.track} d={INK_THREAD} />
    <path className={styles.ink} d={INK_THREAD} pathLength="100" />
  </svg>
);

const DeizaLoader = ({ fullScreen = false, language, thinkingSteps = [] }: DeizaLoaderProps) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const steps = useMemo(() => {
    const result: string[] = [];
    for (const step of thinkingSteps) {
      const clean = cleanStep(step);
      // Repeated heartbeat events don't add another entry to the history.
      if (clean && clean !== result[result.length - 1]) result.push(clean);
    }
    return result;
  }, [thinkingSteps]);
  const label = steps[steps.length - 1] || t(fullScreen ? 'common.loading' : 'loader.fast.1');
  const previousSteps = steps.slice(0, -1);

  return (
    <div
      className={`${styles.loader} ${fullScreen ? styles.fullScreen : ''}`}
      lang={language}
      data-deiza-loader
    >
      <div className={styles.surface}>
        <InkThread />
        <div className={styles.content}>
          {/* Keep the SVG and text node mounted when live status changes. */}
          <p className={styles.label} role="status" aria-live="polite" aria-atomic="true" title={label}>
            {label}
          </p>
          {previousSteps.length > 0 && (
            <>
              <button
                type="button"
                className={styles.historyToggle}
                aria-expanded={expanded}
                aria-controls={historyId}
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                {expanded
                  ? t('loader.less')
                  : previousSteps.length === 1
                    ? t('loader.prev.one')
                    : t('loader.prev.many', { n: previousSteps.length })}
              </button>
              <ol id={historyId} className={styles.history} hidden={!expanded}>
                {previousSteps.map((step, index) => (
                  <li key={index} className={styles.previousStep}>{step}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeizaLoader;
