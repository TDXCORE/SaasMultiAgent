import { use } from 'react';

import { WhatsAppQrContainer } from '@kit/whatsapp/components';
import { PageBody } from '@kit/ui/page';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:routes.whatsapp');

  return {
    title,
  };
};

function WhatsAppSettingsPage() {
  // User authentication is now handled by the API routes
  use(requireUserInServerComponent());

  return (
    <PageBody>
      <div className={'flex w-full flex-1 flex-col'}>
        <WhatsAppQrContainer />
      </div>
    </PageBody>
  );
}

export default withI18n(WhatsAppSettingsPage);
