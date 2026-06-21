// UXRP_Scanner local price DB
// Prices are local starter cache values, not live market prices.
// Display currency is KRW. Fixed conversion rates for this snapshot:
// 1 USD = 1,500 KRW, 1 JPY = 9.4 KRW.
// KREAM PSA10 and TCGPlayer NM can be entered as verified overrides below.
(function () {
  const SET_LANGUAGE = 'JP';
  const SET_CODE = 'M1S';
  const UPDATED_AT = '2026-06-21';
  const USD_TO_KRW = 1500;
  const JPY_TO_KRW = 9.4;

  // Existing local starter cache, USD. Ungraded is used as NM proxy until
  // verified TCGPlayer NM rows are entered.
  const pricechartingUsd = {
    1:[1.50,37.39],2:[1.58,37.20],3:[1.69,38.15],4:[1.41,36.39],5:[1.75,37.07],6:[1.70,37.72],7:[0.99,34.49],8:[null,null],9:[1.44,36.44],10:[1.67,37.57],11:[1.77,38.03],12:[1.56,37.16],13:[1.52,37.44],14:[1.50,36.11],15:[1.43,36.35],16:[1.42,40.67],17:[1.99,39.03],18:[1.18,39.36],19:[1.57,37.03],20:[1.25,35.67],21:[1.22,35.54],22:[1.14,34.53],23:[1.66,37.53],24:[1.25,35.66],25:[1.25,35.66],26:[1.31,35.48],27:[1.53,36.89],28:[1.15,35.21],29:[1.11,35.03],30:[1.49,44.00],31:[1.25,null],32:[0.93,23.37],33:[1.49,36.75],34:[1.50,36.80],35:[1.41,36.39],36:[1.33,36.53],37:[1.38,36.22],38:[1.57,40.00],39:[1.44,36.43],40:[1.31,20.58],41:[1.20,35.44],42:[1.48,35.00],43:[1.25,35.62],44:[1.57,36.40],45:[1.50,36.81],46:[1.15,20.50],47:[null,null],48:[1.45,36.58],49:[1.40,26.00],50:[1.25,34.49],51:[1.63,45.50],52:[1.70,37.75],53:[1.41,22.50],54:[1.10,35.03],55:[1.73,37.35],56:[null,null],57:[1.38,null],58:[1.67,35.67],59:[1.00,34.53],60:[1.54,36.95],61:[1.10,35.04],62:[1.00,37.88],63:[1.39,null],
    64:[3.75,39.98],65:[2.54,31.00],66:[3.26,32.51],67:[2.81,33.86],68:[2.29,23.50],69:[2.51,33.73],70:[3.07,32.14],71:[5.03,49.99],72:[2.86,39.02],73:[2.78,30.83],74:[2.82,34.50],75:[3.77,31.92],76:[2.94,33.80],77:[3.61,37.00],78:[5.95,38.72],79:[4.99,41.01],80:[4.53,40.00],81:[1.96,36.00],82:[2.37,31.49],83:[1.99,42.00],84:[4.81,56.50],85:[3.19,23.49],86:[1.94,22.08],87:[104.23,211.49],88:[39.09,97.55],89:[32.30,76.97],90:[28.89,125.51],91:[11.99,34.00],92:[250.00,866.92]
  };

  const tcgCollectorUsd = {
    64:3.76,65:2.24,66:2.28,67:1.64,68:1.72,69:1.69,70:2.11,71:5.00,72:1.96,73:1.95,74:1.80,75:3.80,76:1.89,77:1.85,78:4.65,79:4.16,80:3.45,81:0.60,82:0.78,83:0.45,84:4.00,85:1.18,86:0.59,87:140,88:41.11,89:29.59,90:29.75,91:13.05,92:268
  };

  // Enter verified source data here when collected.
  // Example: 90: 44500 means NM price is $29.67 converted to KRW already.
  const tcgplayerNmKrw = {
  };

  // KREAM recent transaction price for JP PSA10 cards, KRW.
  const kreamPsa10Krw = {
  };

  const isFiniteNumber = (value) => Number.isFinite(value);

  const median = (values) => {
    const nums = values.filter(isFiniteNumber).sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  };

  const usdToKrw = (usd) => (
    isFiniteNumber(usd)
      ? Math.round((usd * USD_TO_KRW) / 10) * 10
      : null
  );

  const toCardId = (n) => `${SET_LANGUAGE}-${SET_CODE}-${String(n).padStart(3, '0')}`;
  const searchLink = (kind, n) => {
    const number = `${String(n).padStart(3, '0')}/063`;
    if (kind === 'tcgplayer') {
      return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(`Mega Symphonia ${number}`)}`;
    }
    return `https://kream.co.kr/search?keyword=${encodeURIComponent(`메가심포니아 ${number} PSA10`)}`;
  };

  const prices = Array.from({ length: 92 }, (_, i) => {
    const n = i + 1;
    const [pcUngradedUsd, pcPsa10Usd] = pricechartingUsd[n] || [null, null];
    const tcgUsd = tcgCollectorUsd[n] || null;
    const nmUsdFallback = median([pcUngradedUsd, tcgUsd]);
    const nmKrw = isFiniteNumber(tcgplayerNmKrw[n]) ? tcgplayerNmKrw[n] : usdToKrw(nmUsdFallback);
    const psa10Krw = isFiniteNumber(kreamPsa10Krw[n]) ? kreamPsa10Krw[n] : usdToKrw(pcPsa10Usd);
    const hasAnyPrice = isFiniteNumber(nmKrw) || isFiniteNumber(psa10Krw);
    const hasVerifiedNm = isFiniteNumber(tcgplayerNmKrw[n]);
    const hasVerifiedPsa10 = isFiniteNumber(kreamPsa10Krw[n]);

    const sources = [];
    if (hasVerifiedNm) sources.push('TCGPlayer NM');
    else if (isFiniteNumber(tcgUsd) || isFiniteNumber(pcUngradedUsd)) sources.push('USD starter cache converted to KRW');
    if (hasVerifiedPsa10) sources.push('KREAM PSA10 recent transaction');
    else if (isFiniteNumber(pcPsa10Usd)) sources.push('PSA10 USD starter cache converted to KRW');

    return {
      card_id: toCardId(n),
      currency: 'KRW',
      nm_krw: nmKrw,
      psa10_krw: psa10Krw,
      quick_sell_nm_krw: null,
      quick_sell_psa10_krw: null,
      // Legacy fields kept empty so older code does not mistake KRW for JPY.
      nm_jpy: null,
      psa10_jpy: null,
      quick_sell_nm_jpy: null,
      quick_sell_psa10_jpy: null,
      updated_at: UPDATED_AT,
      confidence: hasVerifiedNm && hasVerifiedPsa10 ? 'high' : 'low',
      sources,
      source_links: [searchLink('tcgplayer', n), searchLink('kream', n)],
      exchange_rates: {
        usd_to_krw: USD_TO_KRW,
        jpy_to_krw: JPY_TO_KRW
      },
      note: hasAnyPrice
        ? 'KRW snapshot. Values without TCGPlayer/KREAM overrides are converted starter cache values; verify with market links before trading.'
        : 'No local price data yet.'
    };
  });

  window.MONPRICE_PRICE_META = {
    currency: 'KRW',
    updated_at: UPDATED_AT,
    usd_to_krw: USD_TO_KRW,
    jpy_to_krw: JPY_TO_KRW,
    nm_target_source: 'TCGPlayer',
    psa10_target_source: 'KREAM recent transaction'
  };

  window.MONPRICE_PRICES = prices;
  window.MEGA_SYMPHONIA_PRICES = prices;
})();
