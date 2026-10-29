// A kimenő kapu. Minden levél ezen megy át, ez érvényesíti az alapszabályt:
//  - belső jelentés / riasztás CSAK a profilban megadott vezetői címre mehet;
//  - minden más (kimenő válasz, meghívó, poszt) csak rögzített vezetői jóváhagyással.
const INTERNAL_KINDS = new Set(['belso_jelentes', 'riasztas']);

export function createOutbox({ profile, mailer, log }) {
  return {
    async send({ agent, kind, to, subject, text, html, approval = null }) {
      const leader = profile.vezeto.email.toLowerCase();
      const reject = async (ok_reason) => {
        await log.append({ szereplo: `ugynok:${agent}`, tipus: 'kimeno_elutasitva', tartalom: { kind, to, subject, ok: ok_reason } });
        throw new Error(`Kimenő levél elutasítva: ${ok_reason}`);
      };
      if (INTERNAL_KINDS.has(kind)) {
        if (String(to).toLowerCase() !== leader) return reject('belső jelentés csak a vezetőnek küldhető');
      } else {
        const ok = approval && approval.dontes === 'jovahagyva' && String(approval.by).toLowerCase() === leader;
        if (!ok) return reject('kimenő üzenet vezetői jóváhagyás nélkül');
      }
      const result = await mailer.send({ tenantId: profile.ugyfel_id, kind, to, subject, text, html });
      return result;
    },
  };
}
