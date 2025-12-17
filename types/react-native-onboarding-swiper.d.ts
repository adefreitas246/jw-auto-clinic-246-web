declare module 'react-native-onboarding-swiper' {
  import { ComponentType } from 'react';
  
  interface OnboardingProps {
    onSkip?: () => void;
    onDone?: () => void;
    pages: Array<{
      backgroundColor: string;
      image: React.ReactElement;
      title: string;
      subtitle: string;
    }>;
  }
  
  const Onboarding: ComponentType<OnboardingProps>;
  export default Onboarding;
}
