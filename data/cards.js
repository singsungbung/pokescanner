// MonPrice local card DB
// Scope: Japanese Pokemon Card Game MEGA, M1S Mega Symphonia, 92 cards.
// This file stores card identity/search data only. Prices live in data/prices.js.
(function () {
  const SET = {
    language: 'JP',
    set_code: 'M1S',
    set_name_en: 'Mega Symphonia',
    set_name_jp: 'メガシンフォニア',
    set_name_ko: '메가심포니아'
  };

  const names = [
    [1,'Tangela','モンジャラ','덩쿠리'],[2,'Tangrowth','モジャンボ','덩쿠림보'],[3,'Chikorita','チコリータ','치코리타'],[4,'Bayleef','ベイリーフ','베이리프'],[5,'Meganium','メガニウム','메가니움'],[6,'Shuckle','ツボツボ','단단지'],[7,'Nincada','ツチニン','토중몬'],[8,'Ninjask','テッカニン','아이스크'],[9,'Dhelmise','ダダリン','타타륜'],[10,'Litleo','シシコ','레오꼬'],[11,'Pyroar','カエンジシ','화염레오'],[12,'Sizzlipede','ヤクデ','태우지네'],[13,'Centiskorch','マルヤクデ','다태우지네'],[14,'Chi-Yu','イーユイ','위유이'],[15,'Mantine','マンタイン','만타인'],[16,'Kyogre','カイオーガ','가이오가'],[17,'Snover','ユキカブリ','눈쓰개'],[18,'Mega Abomasnow ex','メガユキノオーex','메가눈설왕 ex'],[19,'Clauncher','ウデッポウ','완철포'],[20,'Clawitzer','ブロスター','블로스터'],[21,'Sobble','メッソン','울머기'],[22,'Drizzile','ジメレオン','누겔레온'],[23,'Inteleon','インテレオン','인텔리레온'],[24,'Snom','ユキハミ','누니머기'],[25,'Frosmoth','モスノウ','모스노우'],[26,'Eiscue','コオリッポ','빙큐보'],[27,'Magnemite','コイル','코일'],[28,'Magneton','レアコイル','레어코일'],[29,'Magnezone','ジバコイル','자포코일'],[30,'Raikou','ライコウ','라이코'],[31,'Electrike','ラクライ','썬더라이'],[32,'Mega Manectric ex','メガライボルトex','메가썬더볼트 ex'],[33,'Pachirisu','パチリス','파치리스'],[34,'Helioptile','エリキテル','목도리키텔'],[35,'Heliolisk','エレザード','일레도리자드'],[36,'Abra','ケーシィ','캐이시'],[37,'Kadabra','ユンゲラー','윤겔라'],[38,'Alakazam','フーディン','후딘'],[39,'Jynx','ルージュラ','루주라'],[40,'Ralts','ラルトス','랄토스'],[41,'Kirlia','キルリア','킬리아'],[42,'Mega Gardevoir ex','メガサーナイトex','메가가디안 ex'],[43,'Shedinja','ヌケニン','껍질몬'],[44,'Spoink','バネブー','피그점프'],[45,'Grumpig','ブーピッグ','피그킹'],[46,'Xerneas','ゼルネアス','제르네아스'],[47,'Greavard','ボチ','망망이'],[48,'Houndstone','ハカドッグ','묘두기'],[49,'Mega Latias ex','メガラティアスex','메가라티아스 ex'],[50,'Latios','ラティオス','라티오스'],[51,'Mega Kangaskhan ex','メガガルーラex','메가캥카 ex'],[52,'Delibird','デリバード','딜리버드'],[53,'Buneary','ミミロル','이어롤'],[54,'Lopunny','ミミロップ','이어롭'],[55,'Stufful','ヌイコグマ','포곰곰'],[56,'Bewear','キテルグマ','이븐곰'],[57,'Suspicious Watch','あやしい時計','수상한 시계'],[58,'Mega Signal','メガシグナル','메가시그널'],[59,"Acerola's Mischief",'アセロラのいたずら','아세로라의 장난'],[60,"Wally's Compassion",'ミツルの思いやり','민진의 배려'],[61,'Vitality Forest','活力の森','활력의 숲'],[62,'Surfing Beach','なみのりビーチ','파도타기 비치'],[63,'Mystery Garden','ミステリーガーデン','미스터리 가든'],
    [64,'Shuckle','ツボツボ','단단지'],[65,'Ninjask','テッカニン','아이스크'],[66,'Litleo','シシコ','레오꼬'],[67,'Snover','ユキカブリ','눈쓰개'],[68,'Clawitzer','ブロスター','블로스터'],[69,'Inteleon','インテレオン','인텔리레온'],[70,'Helioptile','エリキテル','목도리키텔'],[71,'Alakazam','フーディン','후딘'],[72,'Shedinja','ヌケニン','껍질몬'],[73,'Houndstone','ハカドッグ','묘두기'],[74,'Delibird','デリバード','딜리버드'],[75,'Stufful','ヌイコグマ','포곰곰'],[76,'Mega Abomasnow ex','メガユキノオーex','메가눈설왕 ex'],[77,'Mega Manectric ex','メガライボルトex','메가썬더볼트 ex'],[78,'Mega Gardevoir ex','メガサーナイトex','메가가디안 ex'],[79,'Mega Latias ex','メガラティアスex','메가라티아스 ex'],[80,'Mega Kangaskhan ex','メガガルーラex','메가캥카 ex'],[81,'Buddy-Buddy Poffin','なかよしポフィン','친구친구 포핀'],[82,'Rare Candy','ふしぎなアメ','이상한사탕'],[83,'Mega Signal','メガシグナル','메가시그널'],[84,"Acerola's Mischief",'アセロラのいたずら','아세로라의 장난'],[85,"Wally's Compassion",'ミツルの思いやり','민진의 배려'],[86,'Mystery Garden','ミステリーガーデン','미스터리 가든'],[87,'Mega Gardevoir ex','メガサーナイトex','메가가디안 ex'],[88,'Mega Latias ex','メガラティアスex','메가라티아스 ex'],[89,'Mega Kangaskhan ex','メガガルーラex','메가캥카 ex'],[90,"Acerola's Mischief",'アセロラのいたずら','아세로라의 장난'],[91,"Wally's Compassion",'ミツルの思いやり','민진의 배려'],[92,'Mega Gardevoir ex','メガサーナイトex','메가가디안 ex']
  ];

  const rarityByNo = (n) => {
    if (n === 92) return 'MUR';
    if (n >= 87 && n <= 91) return 'SAR';
    if (n >= 76 && n <= 86) return 'SR';
    if (n >= 64 && n <= 75) return 'AR';
    if ([18, 32, 42, 49, 51].includes(n)) return 'RR';
    if ([5, 14, 16, 23, 29, 30, 38, 46, 50].includes(n)) return 'R';
    if ([2,4,8,11,13,20,22,25,28,35,37,41,45,48,54,56,57,58,59,60,61,62,63].includes(n)) return 'U';
    return 'C';
  };

  const cards = names.map(([n, en, jp, ko]) => {
    const padded = String(n).padStart(3, '0');
    const rarity = rarityByNo(n);
    const number = `${padded}/063`;
    const collectorNumber = `${n}/92`;
    const cardId = `${SET.language}-${SET.set_code}-${padded}`;
    const searchKeywords = [
      en, jp, ko, number, collectorNumber, `${SET.set_code} ${padded}`,
      `${SET.set_code}-${padded}`, rarity
    ].filter(Boolean);

    return {
      card_id: cardId,
      id: cardId,
      language: SET.language,
      set_code: SET.set_code,
      set_name_en: SET.set_name_en,
      set_name_jp: SET.set_name_jp,
      set_name_ko: SET.set_name_ko,
      number,
      collector_number: collectorNumber,
      index: n,
      rarity,
      name_en: en,
      name_jp: jp,
      name_ko: ko,
      search_keywords: searchKeywords,
      keywords: searchKeywords,
      image_url: '',
      local_image_path: ''
    };
  });

  window.MONPRICE_SETS = [SET];
  window.MONPRICE_CARDS = cards;
  window.MEGA_SYMPHONIA_CARDS = cards;
})();
