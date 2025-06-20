// This component displays a clickable card used on the home page for different meeting actions.
// It shows an icon, a title, and a description, and can handle a click event.

'use client';

import Image from 'next/image';

import { cn } from '@/lib/utils';

// Define the props (inputs) that HomeCard expects
interface HomeCardProps {
  className?: string;      // Optional extra CSS classes
  img: string;            // Path to the icon image
  title: string;          // Card title text
  description: string;    // Card description text
  handleClick?: () => void; // Optional function to run when card is clicked
}

// The HomeCard functional component
const HomeCard = ({ className, img, title, description, handleClick }: HomeCardProps) => {
  return (
    // The main card section. It uses utility classes for styling and layout.
    <section
      className={cn(
        'bg-orange-1 px-4 py-6 flex flex-col justify-between w-full xl:max-w-[270px] min-h-[260px] rounded-[14px] cursor-pointer',
        className
      )}
      onClick={handleClick} // When clicked, runs the handleClick function if provided
    >
      {/* Icon area at the top of the card */}
      <div className="flex-center glassmorphism size-12 rounded-[10px]">
        <Image src={img} alt="meeting" width={27} height={27} />
      </div>
      
      {/* Title and description area */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-lg font-normal">{description}</p>
      </div>
    </section>
  );
};

export default HomeCard;
