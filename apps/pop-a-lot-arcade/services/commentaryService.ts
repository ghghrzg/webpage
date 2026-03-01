import { GameStats } from '../types';

// Phrases configuration
const ZERO_POINT_PHRASES = [
  { title: "Asleep at the Wheel", text: "Did you fall asleep?" },
  { title: "Mouse Trouble", text: "The mouse is the thing you move with your hand." },
  { title: "Pacifist", text: "Peaceful protest?" },
  { title: "Geological Speed", text: "I've seen rocks move faster." },
  { title: "Zero Hero", text: "Zero? That takes actual effort." }
];

const TIER_1_PHRASES = [ // Bad (< 5000)
  { title: "Grandma Speed", text: "My grandma clicks faster." },
  { title: "Trackpad User", text: "Are you using a trackpad?" },
  { title: "Wake Up", text: "Try opening your eyes next time." },
  { title: "Lag Blamer", text: "Lag? Sure, let's call it lag." },
  { title: "Feline Reflexes", text: "I've seen better clicking from a cat." },
  { title: "Participation Award", text: "You clicked. Just not enough." },
  { title: "Cold Hands", text: "Warm up round?" },
  { title: "Nice Try", text: "That was... an attempt." },
  { title: "Keep Going", text: "Keep practicing!" },
  { title: "Day Job Safe", text: "Don't quit your day job." },
  // Rares
  { title: "Sloth Life", text: "Your best reaction was {bestResponseTime}ms. A sloth is faster.", rare: true },
  { title: "Cute Multiplier", text: "Max multiplier {maxMultiplier}x? That's cute.", rare: true },
  { title: "Lost Count", text: "You missed so many, I lost count.", rare: true },
  { title: "Dial-Up", text: "Median time {medianResponseTime}ms. Dial-up speeds.", rare: true },
  { title: "Glacial Pace", text: "{worstResponseTime}ms worst click? Did you make a sandwich?", rare: true },
  { title: "Combo Breaker", text: "You broke the combo at {maxMultiplier}x. Tragic.", rare: true }
];

const TIER_2_PHRASES = [ // Normal (5000 - 10000)
  { title: "Meh", text: "Not bad, not great." },
  { title: "Average Joe", text: "Average. Just like my Tuesday." },
  { title: "Improving", text: "You're getting there." },
  { title: "Respectable", text: "Respectable effort." },
  { title: "C Plus", text: "Solid C+ performance." },
  { title: "Popper", text: "You popped some." },
  { title: "Listening", text: "Okay, I'm listening." },
  { title: "Better Than Dave", text: "Better than the last guy." },
  { title: "Decent", text: "Decent reflexes." },
  { title: "Mid", text: "Middle of the pack." },
  // Rares
  { title: "Okay Multiplier", text: "{maxMultiplier}x multiplier is okay, I guess.", rare: true },
  { title: "Caffeinated?", text: "Best time {bestResponseTime}ms. Coffee kicking in?", rare: true },
  { title: "Sustained", text: "You sustained {maxMultiplier}x for a bit.", rare: true },
  { title: "Human Standard", text: "{medianResponseTime}ms average. Human standard.", rare: true },
  { title: "Warming Up", text: "{bestResponseTime}ms is getting warmer.", rare: true },
  { title: "Almost There", text: "Hit {maxMultiplier}x but lost it. So close.", rare: true },
  { title: "Steady Hands", text: "{medianResponseTime}ms median. Steady, at least.", rare: true },
  { title: "Not Terrible", text: "Worst click {worstResponseTime}ms. Could be worse.", rare: true },
  { title: "Spike", text: "One click was {bestResponseTime}ms. Do that more.", rare: true },
  { title: "Rhythm Found", text: "Found a rhythm at {maxMultiplier}x.", rare: true },
  { title: "Consistency?", text: "Median {medianResponseTime}ms. Work on consistency.", rare: true },
  { title: "Potential", text: "I see potential in that {bestResponseTime}ms click.", rare: true }
];

const TIER_3_PHRASES = [ // Strong (10000 - 15000)
  { title: "Cooking", text: "Now we're cooking!" },
  { title: "On Fire", text: "Finger on fire!" },
  { title: "Impressive", text: "Impressive clicking." },
  { title: "Gamer?", text: "You actually play this game?" },
  { title: "Satisfying", text: "That was satisfying." },
  { title: "Rhythm Master", text: "Great rhythm!" },
  { title: "Pop Pop Pop", text: "Pop pop pop!" },
  { title: "Natural", text: "You're a natural." },
  { title: "High Score?", text: "High score material?" },
  { title: "Sweaty", text: "Sweaty palms?" },
  { title: "Locked In", text: "You are locked in." },
  { title: "Clean", text: "Clean execution." },
  { title: "Sharp", text: "Sharp reflexes today." },
  { title: "Flow State", text: "Entering flow state." },
  { title: "Clicking Machine", text: "You're a machine." },
  // Rares
  { title: "Blinked?", text: "{bestResponseTime}ms! Did you blink?", rare: true },
  { title: "Nice Flow", text: "Maxed at {maxMultiplier}x! Nice flow.", rare: true },
  { title: "Proper Fast", text: "Median {medianResponseTime}ms is properly fast.", rare: true },
  { title: "Tasty Streak", text: "That {maxMultiplier}x streak was tasty.", rare: true },
  { title: "Laser Focus", text: "{bestResponseTime}ms reaction. Laser focus.", rare: true },
  { title: "Combo King", text: "Held {maxMultiplier}x like a champ.", rare: true },
  { title: "No Hesitation", text: "Average {medianResponseTime}ms. No hesitation.", rare: true },
  { title: "Peak Performance", text: "Peaked at {maxMultiplier}x. Beautiful.", rare: true },
  { title: "Lightning", text: "{bestResponseTime}ms is lightning fast.", rare: true },
  { title: "Consistent", text: "Median {medianResponseTime}ms varies by only 10ms.", rare: true },
  { title: "Zone", text: "You were in the zone at {maxMultiplier}x.", rare: true },
  { title: "Precision", text: "{bestResponseTime}ms. Surgical precision.", rare: true },
  { title: "Momentum", text: "Carried that {maxMultiplier}x momentum well.", rare: true },
  { title: "Reflex Check", text: "{bestResponseTime}ms passed the reflex check.", rare: true },
  { title: "Smooth Operator", text: "Median {medianResponseTime}ms. Smooth operator.", rare: true },
  { title: "Multiplier Hunter", text: "Chasing that {maxMultiplier}x dream.", rare: true },
  { title: "Fast Twitch", text: "{bestResponseTime}ms. Fast twitch fibers active.", rare: true },
  { title: "Solid Run", text: "Only dropped to {worstResponseTime}ms once. Solid.", rare: true },
  { title: "High Gear", text: "Shifted into high gear at {maxMultiplier}x.", rare: true },
  { title: "Pro Material", text: "{medianResponseTime}ms average is pro material.", rare: true },
  { title: "Crisp", text: "Inputs were crisp. Best: {bestResponseTime}ms.", rare: true },
  { title: "Dialed In", text: "Dialed in to {maxMultiplier}x.", rare: true },
  { title: "Electric", text: "That {bestResponseTime}ms click was electric.", rare: true },
  { title: "Serious Business", text: "Median {medianResponseTime}ms. Serious business.", rare: true },
  { title: "Clutch", text: "Saved the {maxMultiplier}x combo. Clutch.", rare: true }
];

const TIER_4_PHRASES = [ // Godlike (>= 15000)
  { title: "ROBOT DETECTED", text: "ARE YOU A ROBOT?" },
  { title: "Unstoppable", text: "UNSTOPPABLE!" },
  { title: "CPU Overload", text: "My CPU is sweating." },
  { title: "Divinity", text: "Clicking divinity." },
  { title: "Keyboard Breaker", text: "Keyboard breaker!" },
  { title: "Legend", text: "Absolute legend." },
  { title: "Hacks?", text: "Cheater? Just kidding." },
  { title: "God Tier", text: "God tier." },
  { title: "I Bow", text: "I bow to you." },
  { title: "Touch Grass", text: "Touch grass maybe?" },
  { title: "Ascended", text: "You have ascended." },
  { title: "New Reality", text: "Is this real life?" },
  { title: "System Error", text: "Score too high. System error." },
  // Rares
  { title: "Illegal Speed", text: "{bestResponseTime}ms?! That's illegal.", rare: true },
  { title: "Boss Mode", text: "Maintained {maxMultiplier}x like a boss.", rare: true },
  { title: "Speed Demon", text: "Median {medianResponseTime}ms. You are speed.", rare: true },
  { title: "Frame Perfect", text: "{bestResponseTime}ms is frame perfect.", rare: true },
  { title: "Infinite Combo", text: "{maxMultiplier}x? Does it ever end?", rare: true },
  { title: "Neural Link", text: "{medianResponseTime}ms. Direct neural link detected.", rare: true },
  { title: "Time Stop", text: "Did you stop time for that {bestResponseTime}ms click?", rare: true },
  { title: "Multiplier God", text: "Worshipping the {maxMultiplier}x multiplier.", rare: true },
  { title: "Zero Latency", text: "Median {medianResponseTime}ms. Zero latency.", rare: true },
  { title: "Aim Bot", text: "{bestResponseTime}ms. Toggling aim bot?", rare: true },
  { title: "Limit Break", text: "Broke the limit at {maxMultiplier}x.", rare: true },
  { title: "Superhuman", text: "{medianResponseTime}ms average is superhuman.", rare: true },
  { title: "Quantum", text: "{bestResponseTime}ms. Quantum clicking.", rare: true },
  { title: "Max Power", text: "Hit {maxMultiplier}x max power.", rare: true },
  { title: "Singularity", text: "Approaching singularity at {medianResponseTime}ms.", rare: true }
];

const formatComment = (text: string, stats: GameStats) => {
  return text
    .replace('{bestResponseTime}', stats.bestResponseTime.toString())
    .replace('{maxMultiplier}', stats.maxMultiplier.toFixed(1))
    .replace('{medianResponseTime}', Math.round(stats.medianResponseTime).toString())
    .replace('{worstResponseTime}', stats.worstResponseTime.toString());
};

const getRandomPhrase = (phrases: typeof TIER_1_PHRASES, stats: GameStats) => {
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  return {
    rankTitle: phrase.title,
    comment: formatComment(phrase.text, stats)
  };
};

export interface GameCommentary {
  rankTitle: string;
  comment: string;
}

export const getGameCommentary = async (score: number, stats: GameStats, _mode: string): Promise<GameCommentary> => {
  // Simulate network delay for "AI" feel
  await new Promise(resolve => setTimeout(resolve, 600));

  if (score === 0) {
    const phrase = ZERO_POINT_PHRASES[Math.floor(Math.random() * ZERO_POINT_PHRASES.length)];
    return { rankTitle: phrase.title, comment: phrase.text };
  }

  // Determine Tier
  // Thresholds: 0-5000 (Bad), 5000-10000 (Normal), 10000-15000 (Strong), 15000+ (Godlike)
  
  if (score < 5000) {
    return getRandomPhrase(TIER_1_PHRASES, stats);
  } else if (score < 10000) {
    return getRandomPhrase(TIER_2_PHRASES, stats);
  } else if (score < 15000) {
    return getRandomPhrase(TIER_3_PHRASES, stats);
  } else {
    return getRandomPhrase(TIER_4_PHRASES, stats);
  }
};
