interface Env {
  VERSIONS_BUCKET: R2Bucket;
}

interface Rollout {
  releaseDate: Date,
  rolloutHours: Record<number, string>
}

/**
 * @typedef {Object} Env
 */

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (!["/stable.json", "/stable.json.sig"].includes(url.pathname)) {
        throw new Error('Invalid requested file');
      }

      const clientIP = request.headers.get("cf-connecting-ip");
      const hashedIp = hashIP(clientIP);
      const rolloutFile: R2ObjectBody = await env.VERSIONS_BUCKET.get('rollout.json');

      if (!rolloutFile) {
        throw new Error('Rollout file not found');
      }

      const percentage = await findRolloutStepForCurrentRequest(await rolloutFile.json());

      const serveStableVersion = hashedIp % 100 < percentage;

      if (url.pathname === "/stable.json") {
        return Response.json(await getVersionFile(env, serveStableVersion ? 'stable.json' : 'stable.previous.json'))
      }

      if (url.pathname === "/stable.json.sig") {
        return Response.json(await getVersionFile(env, serveStableVersion ? 'stable.json.sig' : 'stable.previous.json.sig'))
      }
    } catch (error) {
      return new Response(error.message, {
        status: 500,
        headers: {
          "content-type": "text/plain",
        },
      });
    }

  },
} satisfies ExportedHandler;

/**
 * Iterate over the different rollout steps to find the corresponding percentage for the invocation time (Date.now())
 * @param releaseDate {Date} - The release date in ISO format
 * @param rolloutHours {Rollout['rolloutHours']} - An object representing the rollout steps
 * @returns {number} - The percentage to which the current time applies to
 */
async function findRolloutStepForCurrentRequest({ releaseDate, rolloutHours }: Rollout): Promise<number> {
  const now = Date.now()
  const releaseDateMs = new Date(releaseDate).getTime();

  if (now < releaseDateMs) {
    return 0
  }

  return Object.keys(rolloutHours)
    .reduce((percentage: number, step: string, index: number, hours: string[]) => {
      const stepStartDate = index === 0 ? releaseDateMs : (releaseDateMs + Number(hours[index - 1]) * 3600 * 1000);
      const stepEndDate = releaseDateMs + Number(hours[index]) * 3600 * 1000

      return now >= stepStartDate && now < stepEndDate
        ? ((now - stepStartDate) / (stepEndDate - stepStartDate)) * parsePercentage(rolloutHours[step])
        : percentage
    }, 100)
}

async function getVersionFile(env, file): Promise<string> {
  const fileToServe = await env.VERSIONS_BUCKET.get(file)
  if (!fileToServe) {
    throw new Error('Could not find the target version file');
  }
  return await fileToServe.json();
}

function parsePercentage(percentageString) {
  return Number(percentageString.replace('%', ''))
}

/**
 * Hash function to generate a deterministic hash based on IP.
 * @param {string} ip - The client IP address.
 * @returns {number} - A positive hash value for the IP.
 */
function hashIP(ip: string): number {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash); // Ensure it's positive
}
