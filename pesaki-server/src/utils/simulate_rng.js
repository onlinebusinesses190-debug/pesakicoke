const crypto = require('crypto');

const computeCrashPoint = (serverSeed, clientSeed) => {
  const hash = crypto.createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52);

  if (h % 33 === 0) return 1.00;

  let result = Math.floor((100 * e - h) / (e - h));
  if (result > 10000) result = 10000;
  return Math.max(100, result) / 100;
};

const generateServerSeed = () => {
  return crypto.randomBytes(32).toString('hex');
};

const simulate = (rounds) => {
  let instantCrashes = 0;
  let over2x = 0;
  let over10x = 0;
  let over50x = 0;
  let cappedAt100 = 0;
  let totalMultiplier = 0;

  console.log(`Simulating ${rounds} Aviator rounds...`);

  for (let i = 0; i < rounds; i++) {
    const sSeed = generateServerSeed();
    const cSeed = '0000000000000000000000000000000000000000000000000000000000000000';
    const point = computeCrashPoint(sSeed, cSeed);

    if (point === 1.00) instantCrashes++;
    if (point >= 2.0) over2x++;
    if (point >= 10.0) over10x++;
    if (point >= 50.0) over50x++;
    if (point >= 100.0) cappedAt100++;
    totalMultiplier += point;
  }

  console.log('Results:');
  console.log(`- Instant 1.00x: ${instantCrashes} (${((instantCrashes / rounds) * 100).toFixed(2)}%) [Target: ~3%]`);
  console.log(`- Over 2.00x: ${over2x} (${((over2x / rounds) * 100).toFixed(2)}%)`);
  console.log(`- Over 10.00x: ${over10x} (${((over10x / rounds) * 100).toFixed(2)}%)`);
  console.log(`- Over 50.00x: ${over50x} (${((over50x / rounds) * 100).toFixed(2)}%)`);
  console.log(`- At 100.00x: ${cappedAt100} (${((cappedAt100 / rounds) * 100).toFixed(2)}%)`);
  console.log(`- Average Multiplier: ${(totalMultiplier / rounds).toFixed(4)}`);
};

simulate(10000);
