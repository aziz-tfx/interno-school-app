// amoCRM widget: adds the «Ответ ИИ-агента» step to the Salesbot designer.
// The step is a widget_request to the ERP endpoint; the ERP replies to the
// client via return_url (handler `show`), so nothing else is needed here.
define(['jquery'], function ($) {
  var CustomWidget = function () {
    var self = this;

    this.callbacks = {
      render: function () { return true; },
      init: function () { return true; },
      bind_actions: function () { return true; },
      settings: function () { return true; },
      onSave: function () { return true; },
      destroy: function () {},

      onSalesbotDesignerSave: function (handler_code, params) {
        var endpoint = String((self.get_settings() || {}).endpoint || '').trim();
        return JSON.stringify([
          {
            question: [
              {
                handler: 'widget_request',
                params: {
                  url: endpoint,
                  data: {
                    message: (params && params.message) || '{{message_text}}',
                    lead_id: '{{lead.id}}',
                    contact_id: '{{contact.id}}',
                    contact_name: '{{contact.name}}'
                  }
                }
              }
            ]
          }
        ]);
      }
    };

    return this;
  };

  return CustomWidget;
});
