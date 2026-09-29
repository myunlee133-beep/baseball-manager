/**
 * 이 파일의 숫자는 구 1-100 스케일이다. 엔진은 20-80 스카우팅 스케일을 쓴다.
 * 팀 생성 로직이 구 스케일 그대로 오프셋을 더하므로, 변환은 팩토리 한 곳에서만 한다.
 */
/** 능력치마다 구 데이터의 평균이 달라서 기준점을 따로 잡는다. 20-80 에서 50은 리그 평균이라는 뜻이다. */
const LEGACY_PIVOT = {
    contact: 63,
    power: 60,
    eye: 63,
    speed: 60,
    defense: 66,
    stuff: 69,
    control: 67,
    stamina: 73,
};
const fromLegacy = (value, key) => Math.max(20, Math.min(80, Math.round(50 + (value - LEGACY_PIVOT[key]) * 0.7)));
/** id 에서 나오는 -1~+1. 구 stuff 를 구속과 구위로 쪼갤 때 쓴다. */
const idTilt = (id) => ((id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % 9) - 4) / 4;
const player = (id, name, position, bats, contact, power, eye, speed, defense) => ({
    id,
    name,
    position,
    bats,
    contact: fromLegacy(contact, 'contact'),
    power: fromLegacy(power, 'power'),
    eye: fromLegacy(eye, 'eye'),
    speed: fromLegacy(speed, 'speed'),
    defense: fromLegacy(defense, 'defense'),
    // 인플레이 타구의 질은 컨택에서 파생되는 히든 스탯이다. 여기서 따로 주지 않는다.
    fatigue: 0,
});
const pitcher = (id, name, throws, role, stuff, control, stamina) => ({
    id,
    name,
    throws,
    role,
    // 구 stuff 는 헛스윙과 피BABIP 을 겸했다. 선수마다 다른 비율로 둘에 나눈다.
    velocity: fromLegacy(stuff + idTilt(id) * 9, 'stuff'),
    stuff: fromLegacy(stuff - idTilt(id) * 9, 'stuff'),
    control: fromLegacy(control, 'control'),
    stamina: fromLegacy(stamina, 'stamina'),
    pitchCount: 0,
    fatigue: 0,
});
const prospectPositions = [
    'CF',
    '2B',
    'RF',
    '1B',
    'LF',
    '3B',
    'SS',
    'C',
    'DH',
    'OF',
    'IF',
    'C',
    'OF',
    'IF',
    'OF',
];
const surnames = [
    '강',
    '고',
    '권',
    '김',
    '나',
    '남',
    '노',
    '류',
    '문',
    '민',
    '박',
    '배',
    '서',
    '성',
    '송',
    '신',
    '안',
    '양',
    '오',
    '유',
    '윤',
    '이',
    '임',
    '장',
    '전',
    '정',
    '조',
    '차',
    '최',
    '한',
    '황',
];
const givenNames = [
    '가온',
    '건',
    '건우',
    '경민',
    '도겸',
    '도윤',
    '도현',
    '라온',
    '민규',
    '민석',
    '민준',
    '서준',
    '서진',
    '성민',
    '시우',
    '시윤',
    '우진',
    '윤재',
    '윤호',
    '이든',
    '재민',
    '재윤',
    '정우',
    '주원',
    '준서',
    '준혁',
    '지후',
    '진혁',
    '태경',
    '태윤',
    '태현',
    '하람',
    '하준',
    '현우',
    '현준',
    '현진',
    '호진',
    '휘찬',
    '희찬',
    '은우',
    '지환',
];
/** 팀·선수 식별자를 기반으로 항상 같은 이름을 부여한다. */
export function generatedPlayerName(key, role) {
    const seed = [...`${key}-${role}`].reduce((total, character, index) => total + character.charCodeAt(0) * (index + 11), role === 'pitcher' ? 197 : 71);
    return `${surnames[seed % surnames.length]}${givenNames[Math.floor(seed / surnames.length) % givenNames.length]}`;
}
function reserveHitter(teamId, index) {
    return player(`${teamId}-m-h${index + 1}`, generatedPlayerName(`${teamId}-m-h${index + 1}`, 'hitter'), prospectPositions[index], index % 3 === 0 ? '좌' : '우', 52 + ((index * 7 + teamId.length) % 19), 45 + ((index * 11 + teamId.length) % 25), 50 + ((index * 5 + 3) % 21), 48 + ((index * 9 + 4) % 30), 55 + ((index * 6 + 2) % 23));
}
function reservePitcher(teamId, index) {
    return pitcher(`${teamId}-m-p${index + 1}`, generatedPlayerName(`${teamId}-m-p${index + 1}`, 'pitcher'), index % 3 === 0 ? '좌' : '우', index < 4 ? '선발' : index === 10 ? '마무리' : '중계', 58 + ((index * 7 + teamId.length) % 20), 55 + ((index * 5 + teamId.length) % 20), index < 4 ? 64 + index * 3 : 38 + index * 2);
}
/** 1군 26명(야수 15/투수 11), 2군 26명(야수 15/투수 11)으로 조직을 보정한다. */
function finalizeOrganization(team) {
    const activeHitters = [
        ...team.lineup.map((entry) => entry.player),
        ...team.bench,
    ];
    let extra = 0;
    while (activeHitters.length < 15)
        activeHitters.push(reserveHitter(team.id, extra++));
    const activePitchers = [...team.pitchers];
    while (activePitchers.length < 11)
        activePitchers.push(reservePitcher(team.id, extra++));
    const lineup = makeLineup(activeHitters);
    return {
        ...team,
        lineup,
        bench: activeHitters.slice(9),
        pitchers: activePitchers,
        minorHitters: Array.from({ length: 15 }, (_, index) => reserveHitter(`${team.id}-farm`, index)),
        minorPitchers: Array.from({ length: 11 }, (_, index) => reservePitcher(`${team.id}-farm`, index)),
    };
}
export const blueHitters = [
    player('b01', '이준호', 'CF', '우', 71, 66, 68, 82, 75),
    player('b02', '박민석', '2B', '좌', 94, 30, 48, 76, 78),
    player('b03', '강태웅', 'RF', '좌', 45, 96, 96, 68, 71),
    player('b04', '오진혁', '1B', '우', 45, 96, 35, 43, 63),
    player('b05', '문현수', 'LF', '우', 72, 75, 71, 65, 68),
    player('b06', '임성원', '3B', '우', 65, 70, 63, 58, 70),
    player('b07', '한도윤', 'SS', '좌', 68, 48, 69, 74, 84),
    player('b08', '정민재', 'C', '우', 61, 59, 65, 39, 80),
    player('b09', '배지훈', 'DH', '좌', 64, 68, 62, 61, 55),
    player('b10', '서동욱', 'OF', '좌', 68, 51, 72, 86, 77),
    player('b11', '이영우', 'IF', '우', 62, 65, 60, 57, 75),
    player('b12', '김선빈', 'C', '좌', 58, 55, 68, 42, 76),
    player('b13', '최건우', 'OF', '우', 66, 73, 57, 71, 66),
];
export const bluePitchers = [
    pitcher('bp1', '김재준', '우', '선발', 78, 73, 82),
    pitcher('bp2', '윤서진', '좌', '선발', 73, 77, 78),
    pitcher('bp3', '김도원', '우', '선발', 76, 69, 75),
    pitcher('bp4', '이정욱', '우', '중계', 75, 72, 53),
    pitcher('bp5', '조민석', '좌', '중계', 78, 68, 48),
    pitcher('bp6', '박선우', '우', '마무리', 84, 75, 39),
];
const redHitters = [
    player('r01', '김지훈', 'SS', '좌', 75, 50, 76, 80, 79),
    player('r02', '송현민', 'CF', '좌', 72, 58, 71, 84, 76),
    player('r03', '장태환', '3B', '우', 74, 76, 69, 61, 72),
    player('r04', '나성웅', '1B', '좌', 68, 84, 73, 44, 65),
    player('r05', '정도현', 'DH', '우', 70, 81, 64, 48, 53),
    player('r06', '유승현', 'RF', '우', 67, 73, 62, 67, 70),
    player('r07', '박진우', '2B', '좌', 70, 49, 70, 72, 81),
    player('r08', '이건호', 'C', '우', 63, 62, 67, 36, 83),
    player('r09', '최혜성', 'LF', '좌', 65, 61, 60, 73, 68),
    player('r10', '한지수', 'OF', '우', 64, 69, 59, 68, 70),
    player('r11', '문수민', 'IF', '좌', 67, 45, 72, 75, 80),
    player('r12', '김성진', 'C', '우', 59, 57, 64, 40, 78),
    player('r13', '이태오', 'OF', '좌', 61, 71, 58, 77, 69),
];
const redPitchers = [
    pitcher('rp1', '이현우', '좌', '선발', 80, 71, 80),
    pitcher('rp2', '박성현', '우', '선발', 74, 75, 76),
    pitcher('rp3', '최민재', '우', '중계', 77, 70, 51),
    pitcher('rp4', '송영준', '좌', '중계', 79, 67, 46),
    pitcher('rp5', '장우진', '우', '마무리', 85, 76, 40),
];
export function makeLineup(players) {
    return players
        .slice(0, 9)
        .map((item) => ({ player: { ...item }, position: item.position }));
}
export function createBlueTeam(lineupPlayers = blueHitters.slice(0, 9), starterId = 'bp1') {
    const lineupIds = new Set(lineupPlayers.map((item) => item.id));
    return finalizeOrganization({
        id: 'blue',
        name: 'BLUE WHALES',
        shortName: 'BLU',
        city: '인천',
        color: '#69c6c2',
        lineup: makeLineup(lineupPlayers),
        bench: blueHitters
            .filter((item) => !lineupIds.has(item.id))
            .map((item) => ({ ...item })),
        pitchers: bluePitchers.map((item) => ({ ...item })),
        minorHitters: [],
        minorPitchers: [],
        currentPitcherId: starterId,
        usedPlayerIds: [],
        usedPitcherIds: [],
    });
}
export function createRedTeam() {
    return finalizeOrganization({
        id: 'red',
        name: 'SEOUL REDS',
        shortName: 'RED',
        city: '서울',
        color: '#ef6258',
        lineup: makeLineup(redHitters),
        bench: redHitters.slice(9).map((item) => ({ ...item })),
        pitchers: redPitchers.map((item) => ({ ...item })),
        minorHitters: [],
        minorPitchers: [],
        currentPitcherId: 'rp1',
        usedPlayerIds: [],
        usedPitcherIds: [],
    });
}
const balancedProfile = {
    contact: 62,
    power: 50,
    eye: 60,
    speed: 45,
    defense: 61,
    stuff: 70,
    control: 66,
    stamina: 74,
};
const rating = (value) => Math.max(25, Math.min(99, value));
function createExpansionTeam(id, name, shortName, city, color, names, pitcherNames, profile = {}) {
    const ratings = { ...balancedProfile, ...profile };
    const positions = [
        'CF',
        '2B',
        'RF',
        '1B',
        'LF',
        '3B',
        'SS',
        'C',
        'DH',
        'OF',
        'IF',
        'C',
        'OF',
    ];
    const hitters = names.map((name, index) => player(`${id}-h${index + 1}`, name, positions[index], index % 3 === 0 ? '좌' : '우', rating(ratings.contact + ((index * 7 + id.length) % 15)), rating(ratings.power + ((index * 11 + id.length * 2) % 31)), rating(ratings.eye + ((index * 5 + 4) % 18)), rating(ratings.speed + ((index * 9 + 8) % 39)), rating(ratings.defense + ((index * 6 + 5) % 21))));
    const pitchers = pitcherNames.map((name, index) => pitcher(`${id}-p${index + 1}`, name, index === 1 || index === 3 ? '좌' : '우', index < 2 ? '선발' : index === 4 ? '마무리' : '중계', rating(ratings.stuff + ((index * 6 + id.length) % 15)), rating(ratings.control + ((index * 7 + id.length) % 14)), rating(index < 2 ? ratings.stamina + index * 4 : 42 + index * 4)));
    return finalizeOrganization({
        id,
        name,
        shortName,
        city,
        color,
        lineup: makeLineup(hitters),
        bench: hitters.slice(9),
        pitchers,
        minorHitters: [],
        minorPitchers: [],
        currentPitcherId: pitchers[0].id,
        usedPlayerIds: [],
        usedPitcherIds: [],
    });
}
export function createFalconsTeam() {
    return createExpansionTeam('falcons', 'BUSAN FALCONS', 'BUS', '부산', '#be82d8', [
        '류승현',
        '배진호',
        '이동욱',
        '노진우',
        '임우성',
        '황동혁',
        '원준서',
        '윤현우',
        '신성훈',
        '백우진',
        '김태윤',
        '장우석',
        '이재영',
    ], ['하우진', '정태성', '노재호', '윤태영', '이시우'], {
        contact: 71,
        power: 60,
        eye: 69,
        speed: 67,
        defense: 70,
        stuff: 67,
        control: 65,
    });
}
export function createBearsTeam() {
    return createExpansionTeam('bears', 'DAEGU BEARS', 'DAE', '대구', '#d8ae63', [
        '송재희',
        '김도윤',
        '정현수',
        '최진호',
        '민재성',
        '한재훈',
        '강승우',
        '오현석',
        '박현진',
        '이태민',
        '최준영',
        '윤영훈',
        '김동현',
    ], ['신재현', '박우성', '김현우', '이재희', '정우진'], {
        contact: 56,
        power: 78,
        eye: 54,
        speed: 42,
        defense: 58,
        stuff: 76,
        control: 69,
        stamina: 79,
    });
}
export function createTigersTeam() {
    return createExpansionTeam('tigers', 'GWANGJU TIGERS', 'GWT', '광주', '#e9a23b', [
        '김도하',
        '최유찬',
        '서건우',
        '한시온',
        '이준서',
        '박도윤',
        '오태민',
        '정해원',
        '송민규',
        '류현진',
        '강민수',
        '유정훈',
        '배성우',
    ], ['문재혁', '강태윤', '백승민', '주현우', '조현석'], {
        contact: 76,
        power: 57,
        eye: 74,
        speed: 72,
        defense: 73,
        stuff: 65,
        control: 64,
        stamina: 70,
    });
}
export function createMarinersTeam() {
    return createExpansionTeam('mariners', 'ULSAN MARINERS', 'ULS', '울산', '#367fd3', [
        '전우진',
        '김하람',
        '노윤재',
        '이승찬',
        '윤도겸',
        '장민호',
        '신재윤',
        '최도형',
        '권민석',
        '배준혁',
        '임현서',
        '홍지호',
        '차우성',
    ], ['류건호', '김시현', '안도윤', '박준혁', '이세진'], {
        contact: 64,
        power: 64,
        eye: 68,
        speed: 58,
        defense: 69,
        stuff: 84,
        control: 78,
        stamina: 86,
    });
}
export function createKnightsTeam() {
    return createExpansionTeam('knights', 'SUWON KNIGHTS', 'SUW', '수원', '#6f66d8', [
        '정우성',
        '김태경',
        '박시원',
        '이도현',
        '최윤호',
        '강지환',
        '윤성우',
        '한진호',
        '문태성',
        '송주원',
        '오성민',
        '임도현',
        '백진우',
    ], ['서동현', '이태훈', '김주원', '최강민', '권도윤'], {
        contact: 68,
        power: 72,
        eye: 67,
        speed: 59,
        defense: 64,
        stuff: 72,
        control: 71,
        stamina: 77,
    });
}
export function createStarsTeam() {
    return createExpansionTeam('stars', 'CHANGWON STARS', 'CHW', '창원', '#32ad8a', [
        '유민재',
        '김승호',
        '류지환',
        '박현우',
        '이경민',
        '최승우',
        '정도윤',
        '남우진',
        '장현석',
        '한지민',
        '오재원',
        '송영재',
        '문지후',
    ], ['정민호', '황도윤', '임지훈', '배현수', '노시우'], {
        contact: 59,
        power: 55,
        eye: 61,
        speed: 81,
        defense: 82,
        stuff: 68,
        control: 75,
        stamina: 73,
    });
}
export function createOrbitsTeam() {
    return createExpansionTeam('orbits', 'DAEJEON ORBITS', 'DJN', '대전', '#d85f8c', [
        '김현준',
        '이강우',
        '박준호',
        '최재민',
        '서유진',
        '윤태경',
        '남도현',
        '한성민',
        '류도윤',
        '정시우',
        '강현석',
        '문승현',
        '오준영',
    ], ['이재훈', '김성우', '박태현', '최도진', '유현우'], {
        contact: 48,
        power: 46,
        eye: 52,
        speed: 51,
        defense: 54,
        stuff: 57,
        control: 55,
        stamina: 61,
    });
}
export function createWolvesTeam() {
    return createExpansionTeam('wolves', 'CHUNCHEON WOLVES', 'CCW', '춘천', '#788596', [
        '이태성',
        '장우진',
        '김도혁',
        '박건우',
        '최서준',
        '윤재호',
        '서민우',
        '강현진',
        '문도윤',
        '한재민',
        '류성호',
        '배진우',
        '오태현',
    ], ['김윤호', '정도현', '박시훈', '이현민', '최우석'], {
        contact: 61,
        power: 58,
        eye: 63,
        speed: 64,
        defense: 66,
        stuff: 63,
        control: 61,
        stamina: 68,
    });
}
