/**
 * The chapter's best study resource for each event with a test, copied from the chapter site's
 * src/data/competitiveEvents.ts (the CE team's master list). Update both together.
 */
export type StudyLink = { kind: 'megafolder' | 'tests' | 'flashcards' | 'video'; url: string };

const drive = (id: string): StudyLink => ({ kind: 'megafolder', url: 'https://drive.google.com/drive/folders/' + id });

export const STUDY_LINKS: Record<string, StudyLink> = {
  'Accounting': drive('1NqsEf6tBGjiR6h3o7kdZ1KTdetyByAeC'),
  'Advanced Accounting': drive('13AwfJQ3upSrdMP_W9OqcWSVtfqcduw0L'),
  'Advertising': drive('16M0U5D5urFKpoFxJ5M9dyaPUM6-DRc5Y'),
  'Agribusiness': drive('1UQCHDTCxdSS0lpK7nc1sAqsfVwd_3Jen'),
  'Business Communication': drive('1JaA0lDxsPcDUm83_ctO0JvzEj3B8gnNC'),
  'Business Law': drive('1kuY15P5-1FXjfxU_5ogivhRtS7uweG94'),
  'Computer Problem Solving': drive('1IoV_aXgd7EIyDXDLjzcf-ZdxK1itaUTK'),
  'Cybersecurity': drive('1tL5i-z3ew09TwAV3zEJUEdyENv6G5iMM'),
  'Economics': drive('1ssBAdqbrmKIkT3vb1mj5CcopRt6hCB74'),
  'Healthcare Administration': drive('1QcfHB_PfBhJ_pmgURi8RKUTZoo6i9hf7'),
  'Human Resource Management': { kind: 'flashcards', url: 'https://quizlet.com/275679333/fbla-human-resource-management-flash-cards/' },
  'Insurance & Risk Management': drive('112HtTk_qR0OoOLGAo9Oxs8BZnRGcpi5t'),
  'Introduction to Business Communication': drive('1yVHbixZ8tSIqrzas2bTI61yACfQfjuR7'),
  'Introduction to Business Concepts': drive('14Y49j_4zgEEwzWVIwVIZS5pyGYxTca3U'),
  'Introduction to Business Procedures': drive('1MPd5JuRI5q_uwY34ApcmUzDRV9YF_1ht'),
  'Introduction to FBLA': drive('1rJjRnzCkeFumFclglW6SJewXcpOl5B4z'),
  'Introduction to Information Technology': drive('1UiTSTJ_wAJKVSCprXYeCeS16P3rhhm5t'),
  'Introduction to Marketing Concepts': { kind: 'flashcards', url: 'https://quizlet.com/859125593/fbla-into-to-marketing-concepts-flash-cards/' },
  'Introduction to Parliamentary Procedure': drive('1rs7AYhoNceKd1Vy6o9ltmoX7RSRvxRYn'),
  'Journalism': drive('1v4_hFvcn8QjI3isn6QlIKrJjfKxQubNh'),
  'Networking Infrastructures': drive('1e_nLklxkz5UkMrmvFBB4Yc9iCIMsH8t4'),
  'Organizational Leadership': drive('1CIO4yWeYmx1wuVlyzt7Vfr6EDwiJz_kP'),
  'Personal Finance': drive('1UNzftybpSCkQCQ6AThxOpy4mqCTDlq4V'),
  'Project Management': { kind: 'flashcards', url: 'https://quizlet.com/413776127/project-management-fbla-flash-cards/' },
  'Securities & Investments': drive('14iTKuf7c-5i1fU9X80Hl7rJCYOvCnGqz'),
  'Banking & Financial Systems': drive('1goDzafqo2QnU3sT1ruy4zhVT1eKbWMpY'),
  'Business Management': { kind: 'tests', url: 'https://fbla.testfrenzy.com/business_management.php' },
  'Customer Service': drive('11_LRJkdE6HFhagimSQ-I1qhcImkHTwa4'),
  'Entrepreneurship': drive('1oVUDfbLFWSHzJmdxrONufPT0s4qf-84t'),
  'Hospitality & Event Management': drive('1h4NkIp4qQk_vMjauZSC6_LUTPNGG6yrK'),
  'International Business': drive('102YKcQZUWaL8ChtPzvvdvgN-bWK2ov8x'),
  'Management Information Systems': drive('1hyxd00_e-M5hxH7cF6hpJgYqg3MBSgoy'),
  'Marketing': drive('1b0Cd2NRbRzMovKqKNEbOny9tPLNpJQHm'),
  'Network Design': drive('13ofREkH84l2vZd9BcSzy3p9usDsiIC5f'),
  'Parliamentary Procedure': drive('19urKTiWk4UKxlMDvKEt6P-P6iDFcUdPj'),
  'Sports & Entertainment Management': drive('1yilRtUdtQRfV6FuTcp6gPHmolqFwlgVH'),
  'Technology Support & Services': drive('1ZzEmeqkFJoQ4-7dwazMZGevvdqrm_IND'),
  'Business Ethics': { kind: 'video', url: 'https://youtu.be/i4ITqfAUXV4' },
};

export const STUDY_LABEL: Record<StudyLink['kind'], string> = {
  megafolder: 'Chapter study folder',
  tests: 'Test Frenzy practice tests',
  flashcards: 'Quizlet flashcards',
  video: 'Sample presentation video',
};

/** FBLA posts official sample test items in FBLA Connect (members sign in with their FBLA account). */
export const CONNECT_URL = 'https://connect.fbla.org';
