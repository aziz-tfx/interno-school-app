-- Contacts list and card update live, like deals.
CREATE TRIGGER crm_contacts_notify AFTER INSERT OR UPDATE OR DELETE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE INDEX crm_contacts_updated_idx ON crm_contacts (tenant_id, updated_at DESC) WHERE deleted_at IS NULL;
