import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface LandingSectionProps {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  reverse?: boolean;
}

const LandingSection = ({ title, description, image, imageAlt, reverse }: LandingSectionProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="py-16 sm:py-32 px-4 sm:px-6 overflow-x-hidden" ref={ref}>
      <div
        className={`max-w-6xl mx-auto w-full flex flex-col ${
          reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'
        } items-center gap-8 sm:gap-12 lg:gap-20`}
      >
        <motion.div
          className="flex-1 space-y-6 text-center lg:text-left"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.15] tracking-tight text-foreground">
            {title}
          </h2>
          <p className="font-body text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
            {description}
          </p>
        </motion.div>
        <motion.div
          className="flex-1 flex justify-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        >
          <img
            src={image}
            alt={imageAlt}
            className="w-full max-w-xs sm:max-w-md lg:max-w-lg blend-multiply animate-subtle-float"
            loading="lazy"
            draggable={false}
          />
        </motion.div>
      </div>
    </section>
  );
};

export default LandingSection;
