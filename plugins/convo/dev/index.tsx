import { createDevApp } from '@backstage/dev-utils';
import { convoFrontendPlugin, ConvoFrontendPage } from '../src/plugin';

createDevApp()
  .registerPlugin(convoFrontendPlugin)
  .addPage({
    element: <ConvoFrontendPage />,
    title: 'Convo: AI Search',
    path: '/convo',
  })
  .render();
