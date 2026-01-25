import { Router } from 'express';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { Logger } from 'pino';

export function createLicenseRouter(
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'LicenseAPI' });

  /**
   * GET /license
   * Returns current license information
   */
  router.get('/', async (_req: any, res: any) => {
    try {
      const licenseInfo = licenseEnforcer.getLicenseInfo();

      log.debug({ type: licenseInfo.type }, 'License info requested');

      res.json(licenseInfo);
    } catch (error) {
      log.error({ error }, 'Failed to get license info');
      res.status(500).json({ error: 'Failed to retrieve license information' });
    }
  });

  /**
   * GET /license/features
   * Returns available features for current license
   */
  router.get('/features', async (_req: any, res: any) => {
    try {
      const licenseInfo = licenseEnforcer.getLicenseInfo();

      res.json({
        type: licenseInfo.type,
        features: licenseInfo.features,
        isEnterprise: licenseEnforcer.isEnterprise(),
        isEnterprisePlus: licenseEnforcer.isEnterprisePlus(),
      });
    } catch (error) {
      log.error({ error }, 'Failed to get license features');
      res.status(500).json({ error: 'Failed to retrieve license features' });
    }
  });

  /**
   * GET /license/check/:feature
   * Check if a specific feature is available
   */
  router.get('/check/:feature', async (req: any, res: any) => {
    try {
      const { feature } = req.params;
      const hasFeature = licenseEnforcer.hasFeature(feature);

      licenseEnforcer.trackFeatureAccess(feature, hasFeature);

      res.json({
        feature,
        available: hasFeature,
        licenseType: licenseEnforcer.getLicenseType(),
        upgradeUrl: hasFeature ? null : 'https://parallax.ai/enterprise',
      });
    } catch (error) {
      log.error({ error, feature: req.params.feature }, 'Failed to check feature');
      res.status(500).json({ error: 'Failed to check feature availability' });
    }
  });

  return router;
}
